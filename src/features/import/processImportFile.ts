import { csvRecordsToSheet, parseCsv } from './csv/parseCsv';
import type { CsvParseResult } from './csv/parseCsv';
import { IMPORT_LIMITS } from './importLimits';
import { fileError } from './importTypes';
import type { ImportFileKind, ImportResult } from './importTypes';
import { interpretSheet } from './interpretSheet';
import { isZipSignature } from './xlsx/zipArchive';

function csvFailure(result: Extract<CsvParseResult, { ok: false }>): ImportResult {
  switch (result.reason) {
    case 'unclosedQuote':
      return fileError(
        'unreadable',
        `The file could not be read. Line ${result.line} has an unclosed quotation mark.`,
      );
    case 'quoteInUnquotedValue':
      return fileError(
        'unreadable',
        `The file could not be read. Line ${result.line} has a quotation mark inside an unquoted value. Enclose the whole value in quotation marks and double any quotation marks inside it.`,
      );
    case 'textAfterClosingQuote':
      return fileError(
        'unreadable',
        `The file could not be read. Line ${result.line} has text after a closing quotation mark.`,
      );
    case 'tooManyColumns':
      return fileError(
        'tooManyColumns',
        `Line ${result.line} has more than ${IMPORT_LIMITS.maxColumns} columns. Import files can contain at most ${IMPORT_LIMITS.maxColumns}.`,
      );
  }
}

function processCsv(buffer: ArrayBuffer, fileName: string): ImportResult {
  const bytes = new Uint8Array(buffer);

  if (isZipSignature(bytes)) {
    return fileError(
      'unsupportedType',
      'This file looks like an Excel workbook saved with a .csv name. Rename it to .xlsx or export it as CSV.',
    );
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return fileError(
      'notText',
      'This file is not UTF-8 text. Save it from your spreadsheet application as “CSV UTF-8” and try again.',
    );
  }

  if (text.includes('\u0000')) {
    return fileError('notText', 'This file contains binary data and is not a CSV text file.');
  }

  if (text.trim() === '') {
    return fileError('empty', 'This file is empty.');
  }

  const parsed = parseCsv(text, IMPORT_LIMITS.maxColumns);
  if (!parsed.ok) return csvFailure(parsed);

  return interpretSheet(csvRecordsToSheet(parsed.records), fileName, 'csv');
}

/**
 * Turns file bytes into an import preview. Runs inside the import worker so the whole pipeline
 * is covered by the parse time limit; it is also callable directly in tests.
 */
export async function processImportFile(
  kind: ImportFileKind,
  buffer: ArrayBuffer,
  fileName: string,
): Promise<ImportResult> {
  if (kind === 'csv') {
    return processCsv(buffer, fileName);
  }

  const { readXlsxSheet } = await import('./xlsx/readXlsxSheet');
  const result = await readXlsxSheet(buffer);

  return result.ok
    ? interpretSheet(result.sheet, fileName, 'xlsx')
    : { ok: false, error: result.error };
}
