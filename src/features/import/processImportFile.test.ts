import { describe, expect, it } from 'vitest';
import { buildXlsx } from '@/test/fixtures/xlsx';
import type { XlsxCell, XlsxSheet } from '@/test/fixtures/xlsx';
import { buildZip } from '@/test/fixtures/zip';
import type { ImportResult } from './importTypes';
import { processImportFile } from './processImportFile';
import { inspectZipArchive, readZipEntry } from './xlsx/zipArchive';

const HEADER: XlsxCell[] = ['Currency', 'BAC', 'PV', 'EV', 'AC'];

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function xlsx(sheets: XlsxSheet[], options?: Parameters<typeof buildXlsx>[1]) {
  return processImportFile('xlsx', toBuffer(buildXlsx(sheets, options)), 'costs.xlsx');
}

function csv(text: string | Uint8Array) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return processImportFile('csv', toBuffer(bytes), 'costs.csv');
}

function expectError(result: ImportResult, code: string) {
  if (result.ok) throw new Error('Expected a file error');
  expect(result.error.code).toBe(code);
  return result.error.message;
}

function rows(result: ImportResult) {
  if (!result.ok) throw new Error(`Expected a preview, got: ${result.error.message}`);
  return result.preview.rows;
}

describe('processImportFile — CSV', () => {
  it('reads a valid file with a byte-order mark and quoted grouped amounts', async () => {
    const result = await csv('﻿Currency,BAC,PV,EV,AC\r\nUSD,"100,000",40000,35000,42000\r\n');
    expect(rows(result)[0]?.draft).toEqual({
      currency: 'USD',
      bac: '100,000',
      pv: '40000',
      ev: '35000',
      ac: '42000',
    });
  });

  it('rejects empty, whitespace-only, binary, non-UTF-8, and disguised workbook files', async () => {
    expectError(await csv('  \r\n '), 'empty');
    expectError(await csv(new Uint8Array([0x42, 0x41, 0x43, 0x00, 0x0a])), 'notText');
    expectError(await csv(new Uint8Array([0x42, 0xff, 0xfe, 0x0a])), 'notText');
    expectError(await csv(buildXlsx([{ name: 'S', rows: [HEADER] }])), 'unsupportedType');
  });

  it('reports malformed quoting with the line number', async () => {
    expect(expectError(await csv('BAC,PV,EV,AC\n1,2,3,4\n"5,6,7,8'), 'unreadable')).toBe(
      'The file could not be read. Line 3 has an unclosed quotation mark.',
    );
  });

  it('reports a header-only file', async () => {
    expectError(await csv('Currency,BAC,PV,EV,AC\n'), 'noDataRows');
  });
});

describe('processImportFile — XLSX', () => {
  it('reads a valid workbook, including an offset table, with spreadsheet row numbers', async () => {
    const result = await xlsx([
      {
        name: 'Costs',
        startRow: 3,
        startColumn: 1,
        rows: [HEADER, ['USD', 100000, '40,000', 35000, 42000.5]],
      },
    ]);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.preview.sheetName).toBe('Costs');
    expect(result.preview.rows).toEqual([
      expect.objectContaining({
        rowNumber: 4,
        draft: { currency: 'USD', bac: '100000', pv: '40,000', ev: '35000', ac: '42000.5' },
        errors: [],
      }),
    ]);
  });

  it('reads only the first worksheet of several', async () => {
    const result = await xlsx([
      { name: 'Current', rows: [HEADER, ['EUR', 10, 5, 5, 5]] },
      { name: 'Archive', rows: [HEADER, ['USD', 99, 9, 9, 9]] },
    ]);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.preview.sheetName).toBe('Current');
    expect(result.preview.rows[0]?.draft.currency).toBe('EUR');
  });

  it('uses stored formula results and never evaluates formulas', async () => {
    // The stored result deliberately differs from what the formula would calculate.
    const result = await xlsx([
      { name: 'S', rows: [HEADER, ['USD', 100, { formula: 'B2*0.4', cached: 41 }, 35, 42]] },
    ]);
    expect(rows(result)[0]?.draft.pv).toBe('41');
  });

  it('rejects formulas without stored values and spreadsheet error cells, by cell', async () => {
    const result = await xlsx([
      {
        name: 'S',
        rows: [HEADER, ['USD', { error: '#DIV/0!' }, { formula: 'X1/0' }, 35, { error: '#N/A' }]],
      },
    ]);
    expect(rows(result)[0]?.errors).toEqual([
      { field: 'bac', message: 'the cell contains the spreadsheet error #DIV/0!.' },
      {
        field: 'pv',
        message:
          'the formula has no calculated value. Open and save the file in a spreadsheet application.',
      },
      { field: 'ac', message: 'the cell contains the spreadsheet error #N/A.' },
    ]);
  });

  it('rejects date and boolean cells in amount columns', async () => {
    const result = await xlsx([
      { name: 'S', rows: [HEADER, ['USD', 100, { date: 46112 }, true, 5]] },
    ]);
    expect(rows(result)[0]?.errors).toEqual([
      { field: 'pv', message: 'the cell contains a date (2026-03-31), not an amount.' },
      { field: 'ev', message: 'TRUE is not an amount.' },
    ]);
  });

  it('rejects an empty workbook and a header-only workbook', async () => {
    expectError(await xlsx([{ name: 'S', rows: [] }]), 'noHeader');
    expectError(await xlsx([{ name: 'S', rows: [HEADER] }]), 'noDataRows');
  });

  it('rejects a workbook without worksheets', async () => {
    const result = await xlsx([{ name: 'S', rows: [HEADER] }], {
      mapEntry: (entry) =>
        entry.name.startsWith('xl/worksheets/') ? { ...entry, name: 'xl/other/sheet1.xml' } : entry,
    });
    expectError(result, 'noWorksheets');
  });

  it('rejects non-workbook archives and malformed workbooks', async () => {
    expectError(
      await processImportFile(
        'xlsx',
        toBuffer(buildZip([{ name: 'a.txt', data: 'hi' }])),
        'f.xlsx',
      ),
      'unsupportedType',
    );
    expectError(
      await processImportFile('xlsx', toBuffer(new TextEncoder().encode('BAC,PV')), 'f.xlsx'),
      'unsupportedType',
    );

    const valid = buildXlsx([{ name: 'S', rows: [HEADER, ['USD', 1, 1, 1, 1]] }]);
    expectError(
      await processImportFile('xlsx', toBuffer(valid.slice(0, valid.length - 30)), 'f.xlsx'),
      'unreadable',
    );

    const broken = await xlsx([{ name: 'S', rows: [HEADER] }], {
      mapEntry: (entry) =>
        entry.name === 'xl/worksheets/sheet1.xml'
          ? { ...entry, data: '<worksheet><sheetData><row' }
          : entry,
    });
    expect(broken.ok).toBe(false);
  });
});

describe('processImportFile — XLSX resource safeguards', () => {
  const base: XlsxSheet[] = [{ name: 'S', rows: [HEADER, ['USD', 10, 5, 5, 5]] }];

  it('rejects more than 200 archive entries', async () => {
    const padding = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        name: `docProps/pad${index}.xml`,
        data: 'x',
      }));
    const inspection = inspectZipArchive(buildXlsx(base));
    if (!inspection.ok) throw new Error(inspection.violation);
    const entryCount = inspection.entries.length;
    expect((await xlsx(base, { extraEntries: padding(200 - entryCount) })).ok).toBe(true);
    expectError(await xlsx(base, { extraEntries: padding(201 - entryCount) }), 'resourceLimit');
  });

  it('rejects an entry declaring more than 10 MiB uncompressed', async () => {
    const result = await xlsx(base, {
      extraEntries: [{ name: 'xl/media/big.bin', data: 'x', declaredSize: 10 * 1_048_576 + 1 }],
    });
    expectError(result, 'resourceLimit');
  });

  it('rejects archives declaring more than 20 MiB in total', async () => {
    const entries = [1, 2, 3].map((index) => ({
      name: `xl/media/part${index}.bin`,
      data: 'x',
      declaredSize: 7 * 1_048_576,
    }));
    expectError(await xlsx(base, { extraEntries: entries }), 'resourceLimit');
  });

  it('rejects an entry with a compression ratio above 200:1', async () => {
    // 4 MiB of zeros deflates to a few kilobytes: a real decompression bomb pattern.
    const zeros = new Uint8Array(4 * 1_048_576);
    expectError(
      await xlsx(base, { extraEntries: [{ name: 'xl/media/zeros.bin', data: zeros }] }),
      'resourceLimit',
    );
  });

  it('rejects encrypted entries', async () => {
    const result = await xlsx(base, {
      mapEntry: (entry) =>
        entry.name === 'xl/workbook.xml' ? { ...entry, encrypted: true } : entry,
    });
    expect(expectError(result, 'unreadable')).toMatch(/encrypted or password-protected/);
  });

  it('allows 50 worksheets and rejects 51', async () => {
    const sheets = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        name: `S${index}`,
        rows: [HEADER, ['USD', 10, 5, 5, 5]],
      }));
    expect((await xlsx(sheets(50))).ok).toBe(true);
    expectError(await xlsx(sheets(51)), 'resourceLimit');
  });

  it('rejects more than 50 columns and cells longer than 100 characters', async () => {
    const wide = [...HEADER, ...Array.from({ length: 46 }, (_, index) => `X${index}`)];
    expectError(await xlsx([{ name: 'S', rows: [wide, ['USD', 10, 5, 5, 5]] }]), 'tooManyColumns');

    const long = await xlsx([{ name: 'S', rows: [HEADER, ['USD', '9'.repeat(101), 5, 5, 5]] }]);
    expect(rows(long)[0]?.errors).toEqual([
      { field: 'bac', message: 'the value is too long to be an amount.' },
    ]);
  });

  it('stops decompressing when an entry produces more than it declared', async () => {
    // The worksheet declares a tiny size but inflates past the cap: the check uses real output.
    const bytes = buildZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'xl/workbook.xml', data: 'x' },
      { name: 'xl/worksheets/sheet1.xml', data: new Uint8Array(70_000), declaredSize: 10 },
    ]);
    const inspection = inspectZipArchive(bytes);
    if (!inspection.ok) throw new Error(inspection.violation);
    const sheet = inspection.entries.find((entry) => entry.name === 'xl/worksheets/sheet1.xml');
    if (!sheet) throw new Error('missing entry');
    await expect(readZipEntry(bytes, sheet, 65_536)).rejects.toMatchObject({ reason: 'tooLarge' });
    await expect(readZipEntry(bytes, sheet, 80_000)).resolves.toHaveLength(70_000);
  });
});
