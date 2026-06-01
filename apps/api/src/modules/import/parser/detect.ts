import * as XLSX from 'xlsx';
import { FIELD_PATTERNS, MIN_HEADER_MATCHES, HEADER_SCAN_LIMIT } from './constants';

// Strip everything except lowercase letters and digits — used for fuzzy matching.
export function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Map a normalised header string to its canonical field name.
export function matchField(normalizedHeader: string): string | null {
  if (!normalizedHeader) return null;
  for (const { field, patterns } of FIELD_PATTERNS) {
    for (const p of patterns) {
      // Exact match first, then prefix/contains for multi-word columns.
      if (normalizedHeader === p || normalizedHeader.startsWith(p) || normalizedHeader.includes(p)) {
        return field;
      }
    }
  }
  return null;
}

export interface ColumnInfo {
  colIndex: number;
  header: string;   // original text from Excel
  field: string;    // mapped field name
}

export interface DetectHeaderResult {
  headerRowIndex: number;
  columns: ColumnInfo[];
  score: number;
}

// Read a cell as a plain string, preferring Excel's formatted text (.w).
function cellText(sheet: XLSX.WorkSheet, r: number, c: number): string {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.w !== undefined) return String(cell.w).trim();
  return String(cell.v).trim();
}

// Score a sheet row as a potential header row. Returns matched columns.
function scoreRow(sheet: XLSX.WorkSheet, rowIdx: number, maxCol: number): ColumnInfo[] {
  const columns: ColumnInfo[] = [];
  const seenFields = new Set<string>();

  for (let c = 0; c <= maxCol; c++) {
    const text = cellText(sheet, rowIdx, c);
    if (!text) continue;
    const field = matchField(normalizeStr(text));
    if (field && !seenFields.has(field)) {
      seenFields.add(field);
      columns.push({ colIndex: c, header: text, field });
    }
  }
  return columns;
}

export function detectHeaderRow(sheet: XLSX.WorkSheet): DetectHeaderResult | null {
  const ref = sheet['!ref'];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  const scanEnd = Math.min(range.e.r, HEADER_SCAN_LIMIT);

  let best: DetectHeaderResult | null = null;

  for (let r = range.s.r; r <= scanEnd; r++) {
    const columns = scoreRow(sheet, r, range.e.c);
    if (columns.length >= MIN_HEADER_MATCHES) {
      if (!best || columns.length > best.score) {
        best = { headerRowIndex: r, columns, score: columns.length };
      }
    }
  }

  return best;
}

// Score how well a sheet looks like the Master Task List.
function scoreSheet(workbook: XLSX.WorkBook, sheetName: string): number {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return 0;
  const result = detectHeaderRow(sheet);
  return result?.score ?? 0;
}

export interface DetectSheetResult {
  sheetName: string;
  score: number;
}

const TARGET_SHEET_NAMES = ['mastertasklist', 'masterspreadsheet', 'tasks', 'tasklist'];

export function detectSheet(workbook: XLSX.WorkBook): DetectSheetResult {
  // 1. Prefer exact (normalised) match to "Master Task List"
  for (const name of workbook.SheetNames) {
    const norm = normalizeStr(name);
    if (TARGET_SHEET_NAMES.includes(norm)) {
      return { sheetName: name, score: scoreSheet(workbook, name) };
    }
  }

  // 2. Partial match
  for (const name of workbook.SheetNames) {
    const norm = normalizeStr(name);
    if (norm.includes('task') || norm.includes('master')) {
      return { sheetName: name, score: scoreSheet(workbook, name) };
    }
  }

  // 3. Fall back to highest-scoring sheet
  let best = { sheetName: workbook.SheetNames[0]!, score: 0 };
  for (const name of workbook.SheetNames) {
    const score = scoreSheet(workbook, name);
    if (score > best.score) best = { sheetName: name, score };
  }

  return best;
}
