import { isSupportedCurrency } from '@/domain/currency';
import type { CurrencyCode } from '@/domain/currency';
import { EVA_INPUT_DEFINITIONS, EVA_INPUT_FIELDS } from '@/domain/evaTypes';
import type { EvaInputField } from '@/domain/evaTypes';
import { validateEvaAmounts } from '@/domain/validateEvaInputs';
import type { EvaAmountsDraft } from '@/domain/validateEvaInputs';
import { IMPORT_LIMITS } from './importLimits';
import { fileError, IMPORT_FIELDS } from './importTypes';
import { toPlainDecimal } from './toPlainDecimal';
import type {
  ImportColumn,
  ImportField,
  ImportFileKind,
  ImportResult,
  ImportRow,
  ImportRowError,
  RawCell,
  RawRow,
  RawSheet,
} from './importTypes';

/** Accepted header names per field, compared case-insensitively after trimming. */
const HEADER_ALIASES: Record<ImportField, readonly string[]> = {
  currency: ['currency'],
  bac: ['bac', 'budget at completion'],
  pv: ['pv', 'planned value'],
  ev: ['ev', 'earned value'],
  ac: ['ac', 'actual cost'],
};

export const FIELD_LABELS: Record<ImportField, string> = {
  currency: 'Currency',
  bac: 'BAC',
  pv: 'PV',
  ev: 'EV',
  ac: 'AC',
};

const REQUIRED_FIELDS: readonly EvaInputField[] = EVA_INPUT_FIELDS;

function matchHeader(text: string): ImportField | null {
  const normalised = text.trim().toLowerCase();

  return IMPORT_FIELDS.find((field) => HEADER_ALIASES[field].includes(normalised)) ?? null;
}

function isEmptyCell(cell: RawCell | undefined): boolean {
  return !cell || cell.kind === 'empty' || (cell.kind === 'text' && cell.text.trim() === '');
}

function isEmptyRow(row: RawRow): boolean {
  return row.cells.every(isEmptyCell);
}

/** Number of columns spanned by a row: the index of its last non-empty cell plus one. */
function spannedColumns(row: RawRow): number {
  for (let index = row.cells.length - 1; index >= 0; index -= 1) {
    if (!isEmptyCell(row.cells[index])) {
      return index + 1;
    }
  }
  return 0;
}

export function displayCell(cell: RawCell | undefined): string {
  if (!cell) return '';

  switch (cell.kind) {
    case 'empty':
      return '';
    case 'text':
      return cell.text;
    case 'number':
      return toPlainDecimal(cell.value);
    case 'boolean':
      return cell.value ? 'TRUE' : 'FALSE';
    case 'date':
      return cell.isoDate;
    case 'error':
      return cell.code;
    case 'formulaWithoutValue':
      return 'Formula (no value)';
  }
}

/** Plain-language reason a non-text cell cannot be used, or `null` if its type is acceptable. */
function cellTypeError(cell: RawCell, field: ImportField): string | null {
  const what = field === 'currency' ? 'a currency code' : 'an amount';

  switch (cell.kind) {
    case 'boolean':
      return `${cell.value ? 'TRUE' : 'FALSE'} is not ${what}.`;
    case 'date':
      return `the cell contains a date (${cell.isoDate}), not ${what}.`;
    case 'error':
      return `the cell contains the spreadsheet error ${cell.code}.`;
    case 'formulaWithoutValue':
      return 'the formula has no calculated value. Open and save the file in a spreadsheet application.';
    case 'number':
      return field === 'currency' ? `${String(cell.value)} is not a currency code.` : null;
    case 'text':
      return cell.text.length > IMPORT_LIMITS.maxCellCharacters
        ? `the value is too long to be ${what}.`
        : null;
    case 'empty':
      return null;
  }
}

function cellDraftText(cell: RawCell): string {
  if (cell.kind === 'number') return toPlainDecimal(cell.value);
  if (cell.kind === 'text') return cell.text.trim();
  return '';
}

function interpretRow(
  row: RawRow,
  columns: Map<ImportField, number>,
  headerWidth: number,
  fileKind: ImportFileKind,
): ImportRow {
  const errors: ImportRowError[] = [];
  const values = { currency: '', bac: '', pv: '', ev: '', ac: '' } satisfies Record<
    ImportField,
    string
  >;
  const amounts: EvaAmountsDraft = { bac: '', pv: '', ev: '', ac: '' };
  const typeErrorFields = new Set<ImportField>();
  let currency: CurrencyCode | undefined;

  if (fileKind === 'csv' && spannedColumns(row) > headerWidth) {
    errors.push({
      field: null,
      message: `Row ${row.rowNumber} has more values than there are columns.`,
    });
  }

  for (const field of IMPORT_FIELDS) {
    const index = columns.get(field);
    const cell: RawCell = (index === undefined ? undefined : row.cells[index]) ?? { kind: 'empty' };
    values[field] = displayCell(cell);

    const typeError = cellTypeError(cell, field);
    if (typeError) {
      errors.push({ field, message: typeError });
      typeErrorFields.add(field);
      continue;
    }

    if (field === 'currency') {
      const code = cellDraftText(cell);
      if (code === '') continue;
      if (isSupportedCurrency(code)) {
        currency = code;
      } else {
        errors.push({ field, message: `“${code}” is not a supported currency code.` });
      }
      continue;
    }

    amounts[field] = cellDraftText(cell);
  }

  // A row's own currency sets its decimal places; without one, the form's currency is checked
  // when the analysis is calculated (`PROJECT_REQUIREMENTS.md` §10.4).
  const validation = validateEvaAmounts(amounts, currency);
  if (!validation.ok) {
    for (const field of EVA_INPUT_FIELDS) {
      const error = validation.errors[field];
      // A cell with a type error already has the more specific message.
      if (error && !typeErrorFields.has(field)) {
        errors.push({ field, message: error.message });
      }
    }
  }

  const fieldOrder = (field: ImportField | null) =>
    field === null ? -1 : IMPORT_FIELDS.indexOf(field);
  errors.sort((a, b) => fieldOrder(a.field) - fieldOrder(b.field));

  return {
    rowNumber: row.rowNumber,
    values,
    draft: currency === undefined ? amounts : { ...amounts, currency },
    errors,
  };
}

/**
 * Maps a sheet onto EVA inputs (`docs/PROJECT_REQUIREMENTS.md` §10.2–10.6): the first non-empty
 * row is the header, each later non-empty row is a record, and every record is validated with
 * the same rules as manual entry. Nothing is coerced; blank amounts are errors, never zero.
 */
export function interpretSheet(
  sheet: RawSheet,
  fileName: string,
  fileKind: ImportFileKind,
): ImportResult {
  const { maxColumns, maxDataRows } = IMPORT_LIMITS;
  const rows = sheet.rows.filter((row) => !isEmptyRow(row));

  const widest = rows.reduce((max, row) => Math.max(max, spannedColumns(row)), 0);
  if (widest > maxColumns) {
    return fileError(
      'tooManyColumns',
      `The file has ${widest} columns. Import files can contain at most ${maxColumns}.`,
    );
  }

  const [header, ...dataRows] = rows;
  if (!header) {
    return fileError(
      'noHeader',
      'The file has no header row. Add a header row with BAC, PV, EV, and AC.',
    );
  }

  const columns = new Map<ImportField, number>();
  const headers = new Map<ImportField, string>();
  const ignoredColumns: string[] = [];

  for (const [index, cell] of header.cells.entries()) {
    if (isEmptyCell(cell)) continue;

    const text = displayCell(cell);
    const field = cell?.kind === 'text' ? matchHeader(text) : null;

    if (!field) {
      ignoredColumns.push(text.trim());
      continue;
    }

    const existing = headers.get(field);
    if (existing !== undefined) {
      return fileError(
        'duplicateColumn',
        `Two columns map to ${FIELD_LABELS[field]}: “${existing.trim()}” and “${text.trim()}”.`,
      );
    }

    columns.set(field, index);
    headers.set(field, text);
  }

  const missing = REQUIRED_FIELDS.filter((field) => !columns.has(field));
  if (missing.length > 0) {
    const names = missing.map((field) => EVA_INPUT_DEFINITIONS[field].symbol).join(', ');
    return fileError(
      'missingColumns',
      `Required columns are missing: ${names}. The header row must name BAC, PV, EV, and AC.`,
    );
  }

  if (dataRows.length === 0) {
    return fileError('noDataRows', 'The file has no data rows below the header.');
  }

  if (dataRows.length > maxDataRows) {
    return fileError(
      'tooManyRows',
      `The file has ${dataRows.length} data rows. Import files can contain at most ${maxDataRows}.`,
    );
  }

  const importColumns: ImportColumn[] = IMPORT_FIELDS.flatMap((field) => {
    const headerText = headers.get(field);
    return headerText === undefined ? [] : [{ field, header: headerText.trim() }];
  });

  return {
    ok: true,
    preview: {
      fileName,
      fileKind,
      sheetName: sheet.sheetName,
      columns: importColumns,
      ignoredColumns,
      rows: dataRows.map((row) => interpretRow(row, columns, spannedColumns(header), fileKind)),
    },
  };
}
