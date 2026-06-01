import * as XLSX from 'xlsx';
import { detectSheet, detectHeaderRow, type ColumnInfo, normalizeStr } from './detect';
import { extractRawRow, normalizeRow, validateRow, type ValidatedRow } from './normalize';
import { AppError } from '../../../lib/errors';

export interface ParseResult {
  detectedSheet: string;
  headerRowIndex: number;
  columns: ColumnInfo[];
  columnMap: Record<string, string>; // Excel header → field name (for storage + UI)
  rows: ValidatedRow[];
  stats: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
    skipped: number;
    sprints: Set<string>;
    epics: Set<string>;
    owners: Set<string>;
  };
}

// Validate magic bytes — prevent disguised non-Excel uploads.
function validateMagicBytes(buffer: Buffer, ext: string): void {
  if (ext === '.xlsx') {
    // XLSX is a ZIP: PK header
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new AppError('INVALID_FILE', 'File is not a valid .xlsx workbook', 422);
    }
  } else if (ext === '.xls') {
    // XLS is OLE2 Compound: D0 CF 11 E0
    if (buffer[0] !== 0xd0 || buffer[1] !== 0xcf || buffer[2] !== 0x11 || buffer[3] !== 0xe0) {
      throw new AppError('INVALID_FILE', 'File is not a valid .xls workbook', 422);
    }
  } else {
    throw new AppError('INVALID_FILE', 'Only .xlsx and .xls files are supported', 422);
  }
}

// Hard limits to prevent zip-bomb / pathologically large sheets from exhausting memory.
const MAX_DATA_ROWS = 5_000;
const MAX_COLUMNS   = 100;

function enforceSheetLimits(sheet: XLSX.WorkSheet, sheetName: string): void {
  const ref = sheet['!ref'];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r - range.s.r;
  const colCount = range.e.c - range.s.c;
  if (rowCount > MAX_DATA_ROWS) {
    throw new AppError(
      'FILE_TOO_LARGE',
      `Sheet "${sheetName}" has ${rowCount} rows — maximum allowed is ${MAX_DATA_ROWS}. ` +
      'Export only the task rows and re-upload.',
      422,
    );
  }
  if (colCount > MAX_COLUMNS) {
    throw new AppError(
      'FILE_TOO_LARGE',
      `Sheet "${sheetName}" has ${colCount} columns — maximum allowed is ${MAX_COLUMNS}.`,
      422,
    );
  }
}

function detectBacklogSheet(workbook: XLSX.WorkBook): string | null {
  for (const name of workbook.SheetNames) {
    const norm = normalizeStr(name);
    if (norm === 'deferredbacklog' || norm === 'backlog' || norm.includes('backlog') || norm.includes('deferred')) {
      return name;
    }
  }
  return null;
}

function parseSheetRows(
  sheet: XLSX.WorkSheet,
  headerRowIndex: number,
  columns: ColumnInfo[],
  seenExternalIds: Set<string>,
  rows: ValidatedRow[],
  stats: ParseResult['stats'],
  isDeferredSheet: boolean,
) {
  const ref = sheet['!ref'];
  if (!ref) return;

  const range = XLSX.utils.decode_range(ref);

  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const raw = extractRawRow(sheet, r, columns);
    const norm = normalizeRow(raw);

    // Skip fully empty rows
    const allNull = Object.values(raw.cells).every((v) => !v);
    if (allNull) continue;

    if (isDeferredSheet) {
      // Force status to "deferred" and column to "backlog" for deferred backlog tab rows
      norm.rawStatus = 'deferred';
      norm.columnKey = 'backlog';
    }

    const validated = validateRow(raw, norm, seenExternalIds);

    rows.push(validated);
    stats.total++;

    switch (validated.status) {
      case 'VALID':    stats.valid++;    break;
      case 'WARNING':  stats.warnings++; break;
      case 'ERROR':    stats.errors++;   break;
      case 'SKIPPED':  stats.skipped++;  break;
    }

    if (validated.status !== 'SKIPPED') {
      if (norm.sprintName) stats.sprints.add(norm.sprintName);
      if (norm.epicName)   stats.epics.add(norm.epicName);
      if (norm.ownerName)  stats.owners.add(norm.ownerName);
    }
  }
}

export function parseWorkbook(buffer: Buffer, filename: string): ParseResult {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  validateMagicBytes(buffer, ext);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, sheetRows: MAX_DATA_ROWS + 50 });
  } catch {
    throw new AppError('PARSE_ERROR', 'Could not parse workbook — file may be corrupted', 422);
  }

  if (!workbook.SheetNames.length) {
    throw new AppError('PARSE_ERROR', 'Workbook contains no sheets', 422);
  }

  const { sheetName } = detectSheet(workbook);
  const sheet = workbook.Sheets[sheetName]!;

  enforceSheetLimits(sheet, sheetName);

  const headerResult = detectHeaderRow(sheet);
  if (!headerResult) {
    throw new AppError(
      'PARSE_ERROR',
      `Could not detect header row in sheet "${sheetName}". Please check the column mapping.`,
      422,
    );
  }

  const { headerRowIndex, columns } = headerResult;
  const columnMap: Record<string, string> = {};
  for (const col of columns) columnMap[col.header] = col.field;

  const seenExternalIds = new Set<string>();
  const rows: ValidatedRow[] = [];
  const stats = {
    total: 0,
    valid: 0,
    warnings: 0,
    errors: 0,
    skipped: 0,
    sprints: new Set<string>(),
    epics: new Set<string>(),
    owners: new Set<string>(),
  };

  // 1. Parse main sprint plan sheet
  parseSheetRows(sheet, headerRowIndex, columns, seenExternalIds, rows, stats, false);

  // 2. Parse backlog sheet if it exists
  const backlogSheetName = detectBacklogSheet(workbook);
  if (backlogSheetName && backlogSheetName !== sheetName) {
    const backlogSheet = workbook.Sheets[backlogSheetName]!;
    enforceSheetLimits(backlogSheet, backlogSheetName);
    const backlogHeaderResult = detectHeaderRow(backlogSheet);
    if (backlogHeaderResult) {
      parseSheetRows(
        backlogSheet,
        backlogHeaderResult.headerRowIndex,
        backlogHeaderResult.columns,
        seenExternalIds,
        rows,
        stats,
        true,
      );
    }
  }

  return { detectedSheet: sheetName, headerRowIndex, columns, columnMap, rows, stats };
}

function emptyResult(
  sheetName: string,
  headerRowIndex: number,
  columns: ColumnInfo[],
  columnMap: Record<string, string>,
): ParseResult {
  return {
    detectedSheet: sheetName,
    headerRowIndex,
    columns,
    columnMap,
    rows: [],
    stats: {
      total: 0, valid: 0, warnings: 0, errors: 0, skipped: 0,
      sprints: new Set(), epics: new Set(), owners: new Set(),
    },
  };
}

// Re-run normalize + validate with an updated column map (after user edits mapping).
export function reparse(
  buffer: Buffer,
  filename: string,
  overrideColumnMap: Record<string, string>,
): ParseResult {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  validateMagicBytes(buffer, ext);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, sheetRows: MAX_DATA_ROWS + 50 });
  } catch {
    throw new AppError('PARSE_ERROR', 'Could not re-parse workbook', 422);
  }

  const { sheetName } = detectSheet(workbook);
  const sheet = workbook.Sheets[sheetName]!;
  enforceSheetLimits(sheet, sheetName);
  const headerResult = detectHeaderRow(sheet);
  if (!headerResult) throw new AppError('PARSE_ERROR', 'Header row no longer detectable', 422);

  // Rebuild columns from override map: match headers to user-specified fields.
  const updatedColumns = headerResult.columns.map((col) => ({
    ...col,
    field: overrideColumnMap[col.header] ?? col.field,
  }));

  const seenExternalIds = new Set<string>();
  const rows: ValidatedRow[] = [];
  const stats = {
    total: 0, valid: 0, warnings: 0, errors: 0, skipped: 0,
    sprints: new Set<string>(), epics: new Set<string>(), owners: new Set<string>(),
  };

  // 1. Parse main sprint plan sheet
  parseSheetRows(sheet, headerResult.headerRowIndex, updatedColumns, seenExternalIds, rows, stats, false);

  // 2. Parse backlog sheet if it exists
  const backlogSheetName = detectBacklogSheet(workbook);
  if (backlogSheetName && backlogSheetName !== sheetName) {
    const backlogSheet = workbook.Sheets[backlogSheetName]!;
    enforceSheetLimits(backlogSheet, backlogSheetName);
    const backlogHeaderResult = detectHeaderRow(backlogSheet);
    if (backlogHeaderResult) {
      parseSheetRows(
        backlogSheet,
        backlogHeaderResult.headerRowIndex,
        backlogHeaderResult.columns,
        seenExternalIds,
        rows,
        stats,
        true,
      );
    }
  }

  return {
    detectedSheet: sheetName,
    headerRowIndex: headerResult.headerRowIndex,
    columns: updatedColumns,
    columnMap: overrideColumnMap,
    rows,
    stats,
  };
}
