import * as XLSX from 'xlsx';
import type { ColumnInfo } from './detect';
import { NULL_VALUES, STATUS_MAP, PRIORITY_MAP } from './constants';

export interface RawRow {
  rowIndex: number;
  cells: Record<string, string | null>; // field → raw string value from Excel
}

export interface NormalizedRow {
  externalId: string | null;
  title: string | null;
  sprintName: string | null;
  epicName: string | null;
  ownerName: string | null;
  priority: string | null;       // LOW | MEDIUM | HIGH | CRITICAL | null
  columnKey: string | null;      // mapped from Status
  rawStatus: string | null;      // original status text
  notes: string | null;
  hoursN: number | null;
  hoursI: number | null;
  hoursTotal: number | null;
}

export interface ValidationMessage {
  level: 'info' | 'warning' | 'error';
  field?: string;
  message: string;
}

export interface ValidatedRow {
  raw: Record<string, string | null>;
  normalized: NormalizedRow;
  status: 'VALID' | 'WARNING' | 'ERROR' | 'SKIPPED';
  messages: ValidationMessage[];
}

// Read cell preferring Excel-formatted text (.w) — critical for "0.7", "13.5" etc.
function readCell(sheet: XLSX.WorkSheet, r: number, c: number): string | null {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  if (!cell || cell.v === undefined || cell.v === null) return null;
  const text = cell.w !== undefined ? String(cell.w).trim() : String(cell.v).trim();
  return NULL_VALUES.has(text.toLowerCase()) ? null : (text || null);
}

export function extractRawRow(
  sheet: XLSX.WorkSheet,
  rowIdx: number,
  columns: ColumnInfo[],
): RawRow {
  const cells: Record<string, string | null> = {};
  for (const col of columns) {
    cells[col.field] = readCell(sheet, rowIdx, col.colIndex);
  }
  return { rowIndex: rowIdx, cells };
}

function parseHours(value: string | null): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

function mapStatus(raw: string | null): string {
  if (!raw) return 'backlog';
  // Excel checkbox cells often prefix status text, e.g. "☐ Not started"
  const cleaned = raw.replace(/[\u2610\u2611\u2612\u2713\u2714\u2717\u2718\u25A1\u25A0]/g, '').trim();
  const key = cleaned.toLowerCase();
  return STATUS_MAP[key] ?? 'backlog';
}

function mapPriority(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return PRIORITY_MAP[key] ?? null;
}

export function normalizeRow(raw: RawRow): NormalizedRow {
  const c = raw.cells;
  return {
    externalId:  c['externalId'] ?? null,
    title:       c['title'] ?? null,
    sprintName:  c['sprintName'] ?? null,
    epicName:    c['epicName'] ?? null,
    ownerName:   c['ownerName'] ?? null,
    priority:    mapPriority(c['priority'] ?? null),
    columnKey:   mapStatus(c['status'] ?? null),
    rawStatus:   c['status'] ?? null,
    notes:       c['notes'] ?? null,
    hoursN:      parseHours(c['hoursN'] ?? null),
    hoursI:      parseHours(c['hoursI'] ?? null),
    hoursTotal:  parseHours(c['hoursTotal'] ?? null),
  };
}

export function validateRow(raw: RawRow, norm: NormalizedRow, seenExternalIds: Set<string>): ValidatedRow {
  const messages: ValidationMessage[] = [];
  let status: 'VALID' | 'WARNING' | 'ERROR' | 'SKIPPED' = 'VALID';

  // Skip fully empty rows
  const allNull = Object.values(raw.cells).every((v) => !v);
  if (allNull) {
    return { raw: raw.cells, normalized: norm, status: 'SKIPPED', messages: [] };
  }

  // Required: title
  if (!norm.title) {
    messages.push({ level: 'error', field: 'title', message: 'Task title is required' });
    status = 'ERROR';
  }

  // Warn on unknown status (compare cleaned text, not raw checkbox prefix)
  const cleanedStatus = norm.rawStatus
    ? norm.rawStatus.replace(/[\u2610\u2611\u2612\u2713\u2714\u2717\u2718\u25A1\u25A0]/g, '').trim().toLowerCase()
    : '';
  if (cleanedStatus && !STATUS_MAP[cleanedStatus]) {
    messages.push({
      level: 'warning',
      field: 'status',
      message: `Unknown status "${norm.rawStatus}" — defaulted to Backlog`,
    });
    if (status === 'VALID') status = 'WARNING';
  }

  // Warn on unknown priority
  if (raw.cells['priority'] && !norm.priority) {
    messages.push({
      level: 'warning',
      field: 'priority',
      message: `Unknown priority "${raw.cells['priority']}" — will be left unset`,
    });
    if (status === 'VALID') status = 'WARNING';
  }

  // Warn on duplicate externalId within this import
  if (norm.externalId) {
    if (seenExternalIds.has(norm.externalId)) {
      messages.push({
        level: 'warning',
        field: 'externalId',
        message: `Duplicate ID "${norm.externalId}" — row will be skipped`,
      });
      status = 'SKIPPED';
    } else {
      seenExternalIds.add(norm.externalId);
    }
  }

  return { raw: raw.cells, normalized: norm, status, messages };
}
