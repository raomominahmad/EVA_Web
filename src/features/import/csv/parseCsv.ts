import type { RawSheet } from '../importTypes';

export type CsvParseResult =
  | { ok: true; records: string[][] }
  | {
      ok: false;
      reason: 'unclosedQuote' | 'quoteInUnquotedValue' | 'textAfterClosingQuote' | 'tooManyColumns';
      line: number;
    };

/**
 * Parses CSV text according to RFC 4180: comma separator, fields optionally enclosed in double
 * quotes, doubled quotes inside quoted fields, and quoted fields spanning line breaks. CRLF, LF,
 * and lone CR all end a record. A final line break does not create an extra record. Malformed
 * quoting is reported with its physical line number instead of being guessed at.
 */
export function parseCsv(text: string, maxColumns: number): CsvParseResult {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  // True right after a closing quote, until the next separator or line break.
  let afterQuote = false;
  // True when the current field started with a quote or has any characters.
  let fieldStarted = false;
  let line = 1;
  let quoteLine = 1;
  let index = 0;

  const endField = (): boolean => {
    record.push(field);
    field = '';
    fieldStarted = false;
    afterQuote = false;
    return record.length <= maxColumns;
  };

  const endRecord = () => {
    records.push(record);
    record = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        afterQuote = true;
        index += 1;
        continue;
      }
      if (char === '\r' || char === '\n') {
        // Line breaks inside quotes belong to the field; normalise CRLF to one counted line.
        if (char === '\r' && text[index + 1] === '\n') {
          field += '\r\n';
          index += 2;
        } else {
          field += char;
          index += 1;
        }
        line += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === ',') {
      if (!endField()) return { ok: false, reason: 'tooManyColumns', line };
      index += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      if (!endField()) return { ok: false, reason: 'tooManyColumns', line };
      endRecord();
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1;
      line += 1;
      continue;
    }

    if (afterQuote) {
      return { ok: false, reason: 'textAfterClosingQuote', line };
    }

    if (char === '"') {
      if (fieldStarted) {
        return { ok: false, reason: 'quoteInUnquotedValue', line };
      }
      inQuotes = true;
      fieldStarted = true;
      quoteLine = line;
      index += 1;
      continue;
    }

    field += char;
    fieldStarted = true;
    index += 1;
  }

  if (inQuotes) {
    return { ok: false, reason: 'unclosedQuote', line: quoteLine };
  }

  // Close the last record unless the text ended with a line break (or was empty).
  if (fieldStarted || afterQuote || record.length > 0) {
    if (!endField()) return { ok: false, reason: 'tooManyColumns', line };
    endRecord();
  }

  return { ok: true, records };
}

/** Converts parsed records to the shared sheet model. Record N is spreadsheet row N. */
export function csvRecordsToSheet(records: string[][]): RawSheet {
  return {
    sheetName: null,
    rows: records.map((record, index) => ({
      rowNumber: index + 1,
      cells: record.map((value) =>
        value === '' ? { kind: 'empty' as const } : { kind: 'text' as const, text: value },
      ),
    })),
  };
}
