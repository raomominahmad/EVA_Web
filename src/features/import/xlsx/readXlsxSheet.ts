import { IMPORT_LIMITS } from '../importLimits';
import type { ImportFileError, RawCell, RawSheet } from '../importTypes';
import { inspectZipArchive, readZipEntry, ZipEntryError } from './zipArchive';
import type { ZipEntry, ZipLimitViolation } from './zipArchive';
import { cellReference, findFirstWorksheet, scanSpecialCells } from './workbookStructure';

/**
 * Application-owned `.xlsx` adapter. The rest of the application sees only `RawSheet`, so the
 * third-party reader (`read-excel-file`, loaded on demand) can be replaced here alone.
 *
 * Order of work: archive limits (index only) → workbook structure and special-cell scan (capped
 * decompression) → cell values via `read-excel-file`.
 */

export type XlsxReadResult = { ok: true; sheet: RawSheet } | { ok: false; error: ImportFileError };

const TOO_LARGE: ImportFileError = {
  code: 'resourceLimit',
  message:
    'This workbook is too large or complex to import safely. Save only the EVA values in a new file.',
};

const UNREADABLE: ImportFileError = {
  code: 'unreadable',
  message:
    'The file could not be read as an Excel workbook. It may be damaged or in another format.',
};

function violationError(violation: ZipLimitViolation): ImportFileError {
  switch (violation) {
    case 'notZip':
      return {
        code: 'unsupportedType',
        message: 'This file is not an Excel workbook (.xlsx). Choose a .csv or .xlsx file.',
      };
    case 'notWorkbook':
      return {
        code: 'unsupportedType',
        message: 'This archive is not an Excel workbook (.xlsx). Choose a .csv or .xlsx file.',
      };
    case 'encrypted':
      return {
        code: 'unreadable',
        message:
          'This workbook is encrypted or password-protected. Save an unprotected copy and try again.',
      };
    case 'noWorksheets':
      return { code: 'noWorksheets', message: 'This workbook has no worksheets.' };
    case 'tooManyWorksheets':
      return {
        code: 'resourceLimit',
        message: `This workbook has more than ${IMPORT_LIMITS.zip.maxWorksheets} worksheets. Save only the EVA values in a new file.`,
      };
    case 'truncated':
    case 'multiDisk':
    case 'unsupportedCompression':
      return UNREADABLE;
    case 'zip64':
    case 'tooManyEntries':
    case 'entryTooLarge':
    case 'totalTooLarge':
    case 'compressionRatio':
      return TOO_LARGE;
  }
}

const utf8 = new TextDecoder('utf-8');

async function readText(
  bytes: Uint8Array,
  entries: ZipEntry[],
  name: string,
): Promise<string | null> {
  const entry = entries.find((item) => item.name === name);
  if (!entry) return null;
  const data = await readZipEntry(bytes, entry, IMPORT_LIMITS.zip.maxEntryUncompressedBytes);
  return utf8.decode(data);
}

function toIsoDate(date: Date): string {
  return Number.isNaN(date.getTime()) ? 'invalid date' : date.toISOString().slice(0, 10);
}

function toRawCell(value: unknown): RawCell {
  if (value === null || value === undefined || value === '') return { kind: 'empty' };
  if (typeof value === 'string') return { kind: 'text', text: value };
  if (typeof value === 'number') return { kind: 'number', value };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (value instanceof Date) return { kind: 'date', isoDate: toIsoDate(value) };
  // Not produced by the reader; kept visible so the row fails validation instead of passing.
  return { kind: 'text', text: '[unsupported cell value]' };
}

export async function readXlsxSheet(buffer: ArrayBuffer): Promise<XlsxReadResult> {
  const bytes = new Uint8Array(buffer);
  const inspection = inspectZipArchive(bytes);

  if (!inspection.ok) {
    return { ok: false, error: violationError(inspection.violation) };
  }

  let sheetName: string;
  let special: Map<string, RawCell>;

  try {
    const workbookXml = await readText(bytes, inspection.entries, 'xl/workbook.xml');
    const relationshipsXml = await readText(
      bytes,
      inspection.entries,
      'xl/_rels/workbook.xml.rels',
    );
    const first =
      workbookXml !== null && relationshipsXml !== null
        ? findFirstWorksheet(workbookXml, relationshipsXml)
        : null;
    if (!first) return { ok: false, error: UNREADABLE };

    const worksheetXml = await readText(bytes, inspection.entries, first.path);
    if (worksheetXml === null) {
      return {
        ok: false,
        error: { code: 'noWorksheets', message: 'This workbook has no worksheets.' },
      };
    }

    sheetName = first.name;
    special = scanSpecialCells(worksheetXml);
  } catch (error) {
    if (error instanceof ZipEntryError && error.reason === 'tooLarge') {
      return { ok: false, error: TOO_LARGE };
    }
    return { ok: false, error: UNREADABLE };
  }

  let grid: unknown[][];

  try {
    // Loaded only when an .xlsx file is processed. The web-worker build spawns no workers of its
    // own; this code already runs inside the import worker.
    const { readSheet } = await import('read-excel-file/web-worker');
    grid = await readSheet(buffer, sheetName, { trim: false });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'NO_DATA') {
      return { ok: false, error: { code: 'empty', message: 'This workbook contains no data.' } };
    }
    return { ok: false, error: UNREADABLE };
  }

  // read-excel-file returns an absolute grid from cell A1, so index + 1 is the row number.
  const rows = grid.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map(
      (value, columnIndex) =>
        special.get(cellReference(columnIndex, rowNumber)) ?? toRawCell(value),
    );
    return { rowNumber, cells };
  });

  // Special cells outside the reader's grid (for example an error in an otherwise empty last
  // row) still count. Rows stay sparse, and a far-off column is placed just past the column
  // limit, so a hostile reference such as XFD1048576 cannot force large allocations.
  const byNumber = new Map(rows.map((row) => [row.rowNumber, row]));
  for (const [ref, cell] of special) {
    const match = /^([A-Z]{1,3})(\d{1,7})$/.exec(ref);
    if (!match) continue;
    const letters = match[1] ?? '';
    const column = [...letters].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
    const columnIndex = Math.min(column, IMPORT_LIMITS.maxColumns);
    const rowNumber = Number(match[2]);
    let row = byNumber.get(rowNumber);
    if (!row) {
      row = { rowNumber, cells: [] };
      byNumber.set(rowNumber, row);
      rows.push(row);
    }
    if (row.cells[columnIndex] === undefined || row.cells[columnIndex]?.kind === 'empty') {
      while (row.cells.length < columnIndex) row.cells.push({ kind: 'empty' });
      row.cells[columnIndex] = cell;
    }
  }
  rows.sort((a, b) => a.rowNumber - b.rowNumber);

  return { ok: true, sheet: { sheetName, rows } };
}
