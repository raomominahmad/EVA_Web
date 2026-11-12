/**
 * RFC 4180 CSV writer with spreadsheet formula injection protection (`DECISIONS.md` §8.6).
 *
 * Every cell is typed. Number cells hold raw input or calculated values and are written exactly,
 * never altered. Text cells are neutralized first, then escaped.
 */
export type CsvCell = { kind: 'text'; value: string } | { kind: 'number'; value: number };

export function text(value: string): CsvCell {
  return { kind: 'text', value };
}

export function number(value: number): CsvCell {
  return { kind: 'number', value };
}

// ASCII and full-width (U+FF1D, U+FF0B, U+FF0D, U+FF20) formula triggers.
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '＝', '＋', '－', '＠']);

/**
 * Prefixes one apostrophe when a spreadsheet could read the text as a formula: the first character
 * is a trigger, a tab, or a carriage return, or the first non-whitespace character is a trigger.
 * The rest of the text is preserved exactly.
 */
export function neutralizeFormula(value: string): string {
  const first = value.charAt(0);
  if (first === '\t' || first === '\r' || FORMULA_TRIGGERS.has(first)) {
    return `'${value}`;
  }
  const firstVisible = value.trimStart().charAt(0);
  return FORMULA_TRIGGERS.has(firstVisible) ? `'${value}` : value;
}

/** Quotes a field containing a comma, quote, CR, or LF, doubling embedded quotes (RFC 4180). */
export function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Writes a finite number at full precision. `-0` is written as `0`. */
function formatNumberCell(value: number): string {
  if (!Number.isFinite(value)) {
    // Calculated values are MetricResults, so this is unreachable; never write NaN or Infinity.
    throw new RangeError('CSV number cells must be finite.');
  }
  return String(value);
}

export function serializeCsvCell(cell: CsvCell): string {
  return cell.kind === 'number'
    ? formatNumberCell(cell.value)
    : escapeCsvField(neutralizeFormula(cell.value));
}

/** Serializes rows with CRLF line endings, including after the last row. */
export function serializeCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => `${row.map(serializeCsvCell).join(',')}\r\n`).join('');
}
