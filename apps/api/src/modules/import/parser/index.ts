import * as XLSX from 'xlsx';
import { detectSheet, detectHeaderRow, type ColumnInfo, normalizeStr } from './detect';
import { extractRawRow, normalizeRow, validateRow, type ValidatedRow } from './normalize';
import { AppError } from '../../../lib/errors';

export interface SprintMeta {
  goal?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface ParseResult {
  detectedSheet: string;
  headerRowIndex: number;
  columns: ColumnInfo[];
  columnMap: Record<string, string>; // Excel header → field name (for storage + UI)
  rows: ValidatedRow[];
  sprintMeta: Record<string, SprintMeta>; // sprint name (lowercased) → metadata
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

// Extract a normalised sprint name from a section-header cell value.
// e.g. "   Sprint 1  ·  9–14 Jun  ·  64h estimated" → "Sprint 1"
//      "🚀 Sprint 3" → "Sprint 3"
function extractSprintNameFromSectionHeader(text: string): string | null {
  const t = text.trim();
  if (!/sprint/i.test(t)) return null;
  // Split on decorative separators: middle dot ·, em dash —, en dash –, pipe |
  const firstPart = t.split(/\s*[·–—|]+\s*/)[0]?.trim() ?? t;
  // The candidate should itself contain "sprint"
  const candidate = /sprint/i.test(firstPart) ? firstPart : t;
  // Clean up any leading emoji / icon characters
  return candidate.replace(/^[^\w]*/u, '').replace(/\s+/g, ' ').trim() || null;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Parse date ranges like "9–14 Jun 2025" or "30 Jun–5 Jul 2025".
// Returns YYYY-MM-DD strings (or undefined if not parseable).
function parseDateRange(text: string): { startDate?: string; endDate?: string } {
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch?.[1] ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

  // Cross-month: "30 Jun–5 Jul" or "30 Jun - 5 Jul"
  const cross = text.match(/(\d{1,2})\s+([A-Za-z]+)\s*[–\-]\s*(\d{1,2})\s+([A-Za-z]+)/);
  if (cross?.[1] && cross[2] && cross[3] && cross[4]) {
    const m1 = MONTH_NAMES[cross[2].slice(0, 3).toLowerCase()];
    const m2 = MONTH_NAMES[cross[4].slice(0, 3).toLowerCase()];
    if (m1 !== undefined && m2 !== undefined) {
      return { startDate: iso(year, m1, parseInt(cross[1])), endDate: iso(year, m2, parseInt(cross[3])) };
    }
  }

  // Same month: "9–14 Jun" or "9 - 14 Jun"
  const same = text.match(/(\d{1,2})\s*[–\-]\s*(\d{1,2})\s+([A-Za-z]+)/);
  if (same?.[1] && same[2] && same[3]) {
    const m = MONTH_NAMES[same[3].slice(0, 3).toLowerCase()];
    if (m !== undefined) {
      return { startDate: iso(year, m, parseInt(same[1])), endDate: iso(year, m, parseInt(same[2])) };
    }
  }

  return {};
}

function getFirstNonEmptyCell(sheet: XLSX.WorkSheet, row: number): string | null {
  const ref = sheet['!ref'];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: row, c });
    const cell = sheet[addr];
    if (cell?.v != null) {
      const text = String(cell.v).trim();
      if (text) return text;
    }
  }
  return null;
}

// Scan non-main sheets to pull sprint goals and date ranges.
// The expected structure (from ScrumforGamifiedApp.xlsx):
//   Row 0: "🚀 Sprint 1  ·  9–14 Jun 2025  ·  64h Estimated"
//   Row 1: "  Sprint Goal: …"
function extractSprintMetaFromSheets(
  workbook: XLSX.WorkBook,
  mainSheetName: string,
): Record<string, SprintMeta> {
  const result: Record<string, SprintMeta> = {};

  for (const sheetName of workbook.SheetNames) {
    if (sheetName === mainSheetName) continue;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.['!ref']) continue;

    const row0 = getFirstNonEmptyCell(sheet, 0);
    if (!row0) continue;

    const sprintName = extractSprintNameFromSectionHeader(row0);
    if (!sprintName) continue;

    const meta: SprintMeta = {};

    const { startDate, endDate } = parseDateRange(row0);
    if (startDate) meta.startDate = startDate;
    if (endDate) meta.endDate = endDate;

    const row1 = getFirstNonEmptyCell(sheet, 1);
    if (row1) {
      const goalMatch = row1.match(/sprint\s+goal\s*[:\-]\s*(.*)/i);
      if (goalMatch?.[1]?.trim()) meta.goal = goalMatch[1].trim();
    }

    // Store under both the canonical name and its lowercased form for flexible lookup
    result[sprintName] = meta;
    result[sprintName.toLowerCase()] = meta;
  }

  return result;
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

  // Tracks the sprint inferred from the most-recently-seen section header row.
  // Used when the sheet has no Sprint column and instead separates tasks with
  // rows like "Sprint 1  ·  9–14 Jun  ·  64h estimated".
  let currentSprint: string | null = null;

  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const raw = extractRawRow(sheet, r, columns);
    const norm = normalizeRow(raw);

    // Skip fully empty rows
    const allNull = Object.values(raw.cells).every((v) => !v);
    if (allNull) continue;

    // Detect section-header rows: sprint separators, epic group headers, TOTALS rows, etc.
    // These have data in at most one cell (usually the ID/first column) and no task-like fields.
    const isSectionRow =
      !norm.title && !norm.ownerName && !norm.epicName &&
      !norm.priority && !norm.notes && !norm.sprintName &&
      norm.hoursN === null && norm.hoursI === null && norm.hoursTotal === null;

    if (isSectionRow) {
      // Pick the first non-null cell value — that's where the section label lives.
      const labelCell = Object.values(raw.cells).find((v) => v) ?? null;
      if (labelCell) {
        const sprintName = extractSprintNameFromSectionHeader(labelCell);
        if (sprintName) currentSprint = sprintName;
      }
      continue; // Never emit section rows as task rows
    }

    // When the sheet has no Sprint column, inherit the sprint from the last section header.
    if (!norm.sprintName && currentSprint) {
      norm.sprintName = currentSprint;
    }

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

  // 3. Extract sprint goals / dates from individual sprint sheets
  const sprintMeta = extractSprintMetaFromSheets(workbook, sheetName);

  return { detectedSheet: sheetName, headerRowIndex, columns, columnMap, rows, sprintMeta, stats };
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
    sprintMeta: {},
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

  // 3. Extract sprint goals / dates from individual sprint sheets
  const sprintMeta = extractSprintMetaFromSheets(workbook, sheetName);

  return {
    detectedSheet: sheetName,
    headerRowIndex: headerResult.headerRowIndex,
    columns: updatedColumns,
    columnMap: overrideColumnMap,
    rows,
    sprintMeta,
    stats,
  };
}
