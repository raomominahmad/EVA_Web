import { describe, expect, it } from 'vitest';
import type { ImportPreview, ImportResult, RawCell, RawSheet } from './importTypes';
import { interpretSheet } from './interpretSheet';

type CellInput = string | number | RawCell | null;

function cell(value: CellInput): RawCell {
  if (value === null || value === '') return { kind: 'empty' };
  if (typeof value === 'string') return { kind: 'text', text: value };
  if (typeof value === 'number') return { kind: 'number', value };
  return value;
}

function sheet(rows: CellInput[][], firstRow = 1): RawSheet {
  return {
    sheetName: 'Costs',
    rows: rows.map((row, index) => ({ rowNumber: firstRow + index, cells: row.map(cell) })),
  };
}

const HEADER = ['Currency', 'BAC', 'PV', 'EV', 'AC'];

function preview(result: ImportResult): ImportPreview {
  if (!result.ok) throw new Error(`Expected a preview, got ${result.error.message}`);
  return result.preview;
}

function errorOf(result: ImportResult) {
  if (result.ok) throw new Error('Expected a file error');
  return result.error;
}

function rowErrors(rows: CellInput[][], kind: 'csv' | 'xlsx' = 'csv') {
  return preview(interpretSheet(sheet([HEADER, ...rows]), 'f.csv', kind)).rows.map((row) =>
    row.errors.map((error) => `${error.field ?? 'row'}: ${error.message}`),
  );
}

describe('interpretSheet — structure', () => {
  it('maps a valid sheet and keeps values exactly as read', () => {
    const result = preview(
      interpretSheet(
        sheet([HEADER, ['USD', ' 100,000 ', 40000, '35000.50', 42000]]),
        'costs.csv',
        'csv',
      ),
    );

    expect(result.columns.map((column) => column.field)).toEqual([
      'currency',
      'bac',
      'pv',
      'ev',
      'ac',
    ]);
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        values: { currency: 'USD', bac: ' 100,000 ', pv: '40000', ev: '35000.50', ac: '42000' },
        draft: { currency: 'USD', bac: '100,000', pv: '40000', ev: '35000.50', ac: '42000' },
        errors: [],
      },
    ]);
  });

  it('accepts symbols or full names in any letter case, and lists other columns as ignored', () => {
    const result = preview(
      interpretSheet(
        sheet([
          [
            '  budget at completion ',
            'planned VALUE',
            'Earned Value',
            'actual cost',
            'Notes',
            'Owner',
          ],
          [1000, 500, 400, 450, 'x', 'y'],
        ]),
        'f.csv',
        'csv',
      ),
    );

    expect(result.columns).toEqual([
      { field: 'bac', header: 'budget at completion' },
      { field: 'pv', header: 'planned VALUE' },
      { field: 'ev', header: 'Earned Value' },
      { field: 'ac', header: 'actual cost' },
    ]);
    expect(result.ignoredColumns).toEqual(['Notes', 'Owner']);
    expect(result.rows[0]?.draft).toEqual({ bac: '1000', pv: '500', ev: '400', ac: '450' });
  });

  it('uses the first non-empty row as the header and skips empty rows without renumbering', () => {
    const result = preview(
      interpretSheet(sheet([[null, ''], HEADER, ['  '], ['EUR', 10, 5, 5, 5]]), 'f.csv', 'csv'),
    );
    expect(result.rows.map((row) => row.rowNumber)).toEqual([4]);
  });

  it('rejects a sheet with no header row', () => {
    expect(errorOf(interpretSheet(sheet([]), 'f.csv', 'csv')).code).toBe('noHeader');
    expect(errorOf(interpretSheet(sheet([[null], ['']]), 'f.csv', 'csv')).code).toBe('noHeader');
  });

  it('rejects a file containing only the header', () => {
    expect(errorOf(interpretSheet(sheet([HEADER]), 'f.csv', 'csv'))).toEqual({
      code: 'noDataRows',
      message: 'The file has no data rows below the header.',
    });
  });

  it('names every missing required column', () => {
    expect(
      errorOf(
        interpretSheet(
          sheet([
            ['Currency', 'BAC', 'PV'],
            ['USD', 1, 1],
          ]),
          'f',
          'csv',
        ),
      ),
    ).toEqual({
      code: 'missingColumns',
      message:
        'Required columns are missing: EV, AC. The header row must name BAC, PV, EV, and AC.',
    });
  });

  it('rejects duplicate or ambiguous column mappings', () => {
    expect(
      errorOf(
        interpretSheet(
          sheet([
            ['BAC', 'PV', 'Planned Value', 'EV', 'AC'],
            [1, 1, 1, 1, 1],
          ]),
          'f',
          'csv',
        ),
      ),
    ).toEqual({
      code: 'duplicateColumn',
      message: 'Two columns map to PV: “PV” and “Planned Value”.',
    });
    expect(
      errorOf(
        interpretSheet(
          sheet([
            ['BAC', 'bac', 'PV', 'EV', 'AC'],
            [1, 1, 1, 1, 1],
          ]),
          'f',
          'csv',
        ),
      ).code,
    ).toBe('duplicateColumn');
  });

  it('allows 100 data rows and rejects 101', () => {
    const row = ['USD', 10, 5, 5, 5];
    expect(
      preview(
        interpretSheet(sheet([HEADER, ...Array.from({ length: 100 }, () => row)]), 'f', 'csv'),
      ).rows,
    ).toHaveLength(100);
    expect(
      errorOf(
        interpretSheet(sheet([HEADER, ...Array.from({ length: 101 }, () => row)]), 'f', 'csv'),
      ),
    ).toEqual({
      code: 'tooManyRows',
      message: 'The file has 101 data rows. Import files can contain at most 100.',
    });
  });

  it('allows 50 columns and rejects 51', () => {
    const fifty = [...HEADER, ...Array.from({ length: 45 }, (_, index) => `X${index}`)];
    expect(interpretSheet(sheet([fifty, ['USD', 10, 5, 5, 5]]), 'f', 'xlsx').ok).toBe(true);
    expect(
      errorOf(
        interpretSheet(
          sheet([
            [...fifty, 'Extra'],
            ['USD', 10, 5, 5, 5],
          ]),
          'f',
          'xlsx',
        ),
      ),
    ).toEqual({
      code: 'tooManyColumns',
      message: 'The file has 51 columns. Import files can contain at most 50.',
    });
  });
});

describe('interpretSheet — row validation', () => {
  it('applies the manual-entry rules and never treats blanks as zero', () => {
    expect(rowErrors([['USD', '', '', '', '']])).toEqual([
      [
        'bac: Enter the Budget at Completion (BAC).',
        'pv: Enter the Planned Value (PV).',
        'ev: Enter the Earned Value (EV).',
        'ac: Enter the Actual Cost (AC).',
      ],
    ]);
  });

  it('reports malformed, negative, exponential, and too-large values per field', () => {
    expect(rowErrors([['USD', '1,23,4', -5, '1e5', 9007199254740992]])).toEqual([
      [
        'bac: Check the thousands separators in BAC. Use groups of three digits, for example 1,250,000.',
        'pv: PV cannot be negative.',
        'ev: Enter EV as a plain number, without exponential notation such as 1e5.',
        'ac: AC is too large. The maximum supported amount is 9,007,199,254,740,991.',
      ],
    ]);
    expect(rowErrors([['USD', 'abc', '$5', 5, 5]])[0]).toEqual([
      'bac: Enter BAC as a number, for example 125000 or 125,000.50.',
      'pv: Enter PV as a number, for example 125000 or 125,000.50.',
    ]);
  });

  it('applies BAC limits and allows EV above PV, AC above BAC, and zero PV and AC', () => {
    expect(rowErrors([['USD', 0, 0, 0, 0]])).toEqual([['bac: BAC must be greater than zero.']]);
    expect(rowErrors([['USD', 100, 101, 150, 5]])[0]).toEqual([
      "pv: PV cannot exceed BAC under this application's baseline assumptions.",
      "ev: EV cannot exceed BAC under this application's baseline assumptions.",
    ]);
    expect(rowErrors([['USD', 100, 0, 60, 500]])).toEqual([[]]);
  });

  it('rejects non-finite numbers', () => {
    expect(rowErrors([['USD', Number.POSITIVE_INFINITY, Number.NaN, 1, 1]])[0]).toEqual([
      'bac: Enter BAC as a number, for example 125000 or 125,000.50.',
      'pv: Enter PV as a number, for example 125000 or 125,000.50.',
    ]);
  });

  it('validates currency codes and treats a blank currency as not specified', () => {
    expect(
      rowErrors([
        ['usd', 10, 5, 5, 5],
        ['XYZ', 10, 5, 5, 5],
        [7, 10, 5, 5, 5],
      ]),
    ).toEqual([
      ['currency: “usd” is not a supported currency code.'],
      ['currency: “XYZ” is not a supported currency code.'],
      ['currency: 7 is not a currency code.'],
    ]);

    const blank = preview(interpretSheet(sheet([HEADER, ['', 10, 5, 5, 5]]), 'f', 'csv')).rows[0];
    expect(blank?.errors).toEqual([]);
    expect(blank?.draft).not.toHaveProperty('currency');
  });

  it('rejects spreadsheet error cells, formulas without values, dates, and booleans', () => {
    expect(
      rowErrors(
        [
          [
            'USD',
            { kind: 'error', code: '#DIV/0!' },
            { kind: 'formulaWithoutValue' },
            { kind: 'date', isoDate: '2026-03-31' },
            { kind: 'boolean', value: true },
          ],
        ],
        'xlsx',
      )[0],
    ).toEqual([
      'bac: the cell contains the spreadsheet error #DIV/0!.',
      'pv: the formula has no calculated value. Open and save the file in a spreadsheet application.',
      'ev: the cell contains a date (2026-03-31), not an amount.',
      'ac: TRUE is not an amount.',
    ]);
  });

  it('rejects recognised values longer than 100 characters', () => {
    expect(rowErrors([['USD', '1'.repeat(101), '1'.repeat(100), 5, 5]])[0]).toEqual([
      'bac: the value is too long to be an amount.',
      'pv: PV is too large. The maximum supported amount is 9,007,199,254,740,991.',
    ]);
    expect(rowErrors([['U'.repeat(101), 10, 5, 5, 5]])[0]).toEqual([
      'currency: the value is too long to be a currency code.',
    ]);
  });

  it('reports a CSV row with more values than columns as a row error', () => {
    expect(rowErrors([['USD', 10, 5, 5, 5, 'extra']])[0]).toEqual([
      'row: Row 2 has more values than there are columns.',
    ]);
  });

  it('writes numeric cells as plain decimals that match the parsed value', () => {
    const row = preview(interpretSheet(sheet([HEADER, ['USD', 10, 0.25, 0.5, 2]]), 'f', 'xlsx'))
      .rows[0];
    expect(row?.draft).toMatchObject({ bac: '10', pv: '0.25', ev: '0.5', ac: '2' });
    expect(row?.errors).toEqual([]);

    // A tiny value is written without an exponent, then checked against the currency.
    const tiny = preview(interpretSheet(sheet([HEADER, ['KWD', 10, 1e-7, 0.5, 2]]), 'f', 'xlsx'))
      .rows[0];
    expect(tiny?.draft.pv).toBe('0.0000001');
    expect(tiny?.errors.map((error) => error.message)).toEqual([
      'PV can have at most 3 decimal places in KWD.',
    ]);
  });
});

describe('interpretSheet — monetary precision (D4)', () => {
  it('limits decimal places to the row currency, for CSV text and XLSX numbers alike', () => {
    expect(rowErrors([['USD', '100.125', '10', '10', '10']])[0]).toEqual([
      'bac: BAC can have at most 2 decimal places in USD.',
    ]);
    expect(rowErrors([['JPY', 1000, 0.5, 0, 0]], 'xlsx')[0]).toEqual([
      'pv: PV cannot have decimal places in JPY.',
    ]);
    expect(rowErrors([['KWD', '100.125', '10.5', '0.001', '0']])[0]).toEqual([]);
    // Trailing zeros beyond the minor unit do not change the amount.
    expect(rowErrors([['USD', '100.500', '10', '10', '10']])[0]).toEqual([]);
  });

  it('rejects a floating-point spreadsheet result instead of rounding it', () => {
    expect(rowErrors([['USD', 100, 0.1 + 0.2, 0, 0]], 'xlsx')[0]).toEqual([
      'pv: PV can have at most 2 decimal places in USD.',
    ]);
  });

  it('rejects amounts that would be silently rounded, in CSV and XLSX', () => {
    const message =
      'has too many digits to be stored exactly. Use at most 15 significant digits, or a whole number up to 9,007,199,254,740,991.';
    expect(rowErrors([['', '9007199254740990.5', '0', '0', '0']])[0]).toEqual([
      `bac: BAC ${message}`,
    ]);
    expect(rowErrors([['USD', '1234567890123456.7', '0', '0', '0']])[0]).toEqual([
      `bac: BAC ${message}`,
    ]);
    // The largest whole number stays valid in both formats.
    expect(rowErrors([['USD', '9007199254740991', '0', '0', '0']])[0]).toEqual([]);
    expect(rowErrors([['JPY', Number.MAX_SAFE_INTEGER, 0, 0, 0]], 'xlsx')[0]).toEqual([]);
  });

  it('defers the decimal-place check for a row without a currency to the form', () => {
    const row = preview(
      interpretSheet(sheet([HEADER, ['', '100.125', '10', '10', '10']]), 'f.csv', 'csv'),
    ).rows[0];
    expect(row?.errors).toEqual([]);
    expect(row?.draft.bac).toBe('100.125');
  });
});
