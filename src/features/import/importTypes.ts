import type { EvaInputDraft, EvaInputField } from '@/domain/evaTypes';

export type ImportFileKind = 'csv' | 'xlsx';

/** A cell as read from a file, before EVA interpretation. */
export type RawCell =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  /** A date-formatted spreadsheet cell, as `YYYY-MM-DD`. */
  | { kind: 'date'; isoDate: string }
  /** A spreadsheet error value such as `#DIV/0!`. */
  | { kind: 'error'; code: string }
  /** A formula whose calculated value was not stored in the file. */
  | { kind: 'formulaWithoutValue' };

export interface RawRow {
  /** Row number as a spreadsheet application shows it (1-based). */
  rowNumber: number;
  /** Cells by 0-based column index. */
  cells: RawCell[];
}

export interface RawSheet {
  sheetName: string | null;
  rows: RawRow[];
}

export type ImportField = 'currency' | EvaInputField;

export const IMPORT_FIELDS: readonly ImportField[] = ['currency', 'bac', 'pv', 'ev', 'ac'];

export type ImportFileErrorCode =
  | 'unsupportedType'
  | 'empty'
  | 'tooLarge'
  | 'unreadable'
  | 'notText'
  | 'resourceLimit'
  | 'timeout'
  | 'noWorksheets'
  | 'noHeader'
  | 'noDataRows'
  | 'tooManyRows'
  | 'tooManyColumns'
  | 'missingColumns'
  | 'duplicateColumn';

export interface ImportFileError {
  code: ImportFileErrorCode;
  message: string;
}

/** A problem with one row. `field` is `null` for a problem with the row as a whole. */
export interface ImportRowError {
  field: ImportField | null;
  message: string;
}

export interface ImportRow {
  rowNumber: number;
  /** Values exactly as read, for display. Empty string for an empty or unmapped cell. */
  values: Record<ImportField, string>;
  /** Text written to the input draft when this row is applied. Only meaningful when valid. */
  draft: Pick<EvaInputDraft, EvaInputField> & { currency?: string };
  errors: ImportRowError[];
}

export interface ImportColumn {
  field: ImportField;
  header: string;
}

export interface ImportPreview {
  fileName: string;
  fileKind: ImportFileKind;
  sheetName: string | null;
  columns: ImportColumn[];
  ignoredColumns: string[];
  rows: ImportRow[];
}

export type ImportResult =
  { ok: true; preview: ImportPreview } | { ok: false; error: ImportFileError };

export function fileError(code: ImportFileErrorCode, message: string): ImportResult {
  return { ok: false, error: { code, message } };
}
