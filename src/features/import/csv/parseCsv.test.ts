import { describe, expect, it } from 'vitest';
import { csvRecordsToSheet, parseCsv } from './parseCsv';

function records(text: string) {
  const result = parseCsv(text, 50);
  if (!result.ok) throw new Error(`Expected success, got ${result.reason} on line ${result.line}`);
  return result.records;
}

describe('parseCsv', () => {
  it('parses a header and data rows', () => {
    expect(records('Currency,BAC,PV,EV,AC\nUSD,100000,40000,35000,42000\n')).toEqual([
      ['Currency', 'BAC', 'PV', 'EV', 'AC'],
      ['USD', '100000', '40000', '35000', '42000'],
    ]);
  });

  it('keeps commas inside quoted values', () => {
    expect(records('BAC,PV\n"100,000","1,234.50"')).toEqual([
      ['BAC', 'PV'],
      ['100,000', '1,234.50'],
    ]);
  });

  it('unescapes doubled quotes inside quoted values', () => {
    expect(records('Note\n"He said ""hi"""\n""""')).toEqual([['Note'], ['He said "hi"'], ['"']]);
  });

  it('keeps empty fields, including trailing ones', () => {
    expect(records('a,,c,\n,,,')).toEqual([
      ['a', '', 'c', ''],
      ['', '', '', ''],
    ]);
    expect(records('"",x')).toEqual([['', 'x']]);
  });

  it('accepts CRLF, LF, and CR line endings and ignores one final line break', () => {
    expect(records('a,b\r\nc,d\ne,f\rg,h\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ]);
  });

  it('keeps blank lines as empty records so row numbers match a spreadsheet', () => {
    const sheet = csvRecordsToSheet(records('BAC\n\n100'));
    expect(sheet.rows.map((row) => row.rowNumber)).toEqual([1, 2, 3]);
    expect(sheet.rows[1]?.cells).toEqual([{ kind: 'empty' }]);
  });

  it('allows line breaks inside quoted values', () => {
    expect(records('Note,BAC\n"line one\r\nline two",5\nx,6')).toEqual([
      ['Note', 'BAC'],
      ['line one\r\nline two', '5'],
      ['x', '6'],
    ]);
  });

  it('reports an unclosed quote with the line where it opened', () => {
    expect(parseCsv('BAC\n100\n"200\n300', 50)).toEqual({
      ok: false,
      reason: 'unclosedQuote',
      line: 3,
    });
  });

  it('rejects a quote inside an unquoted value', () => {
    expect(parseCsv('BAC\n10"0', 50)).toEqual({
      ok: false,
      reason: 'quoteInUnquotedValue',
      line: 2,
    });
  });

  it('rejects text after a closing quote', () => {
    expect(parseCsv('BAC\n"100"x', 50)).toEqual({
      ok: false,
      reason: 'textAfterClosingQuote',
      line: 2,
    });
  });

  it('stops at the column limit instead of reading an unbounded row', () => {
    expect(parseCsv(`${'a,'.repeat(50)}a`, 50)).toEqual({
      ok: false,
      reason: 'tooManyColumns',
      line: 1,
    });
    expect(parseCsv(`${'a,'.repeat(49)}a`, 50).ok).toBe(true);
  });

  it('returns no records for empty text', () => {
    expect(records('')).toEqual([]);
  });

  it('converts empty strings to empty cells and keeps text exactly', () => {
    expect(csvRecordsToSheet([[' 1,000 ', '']]).rows[0]?.cells).toEqual([
      { kind: 'text', text: ' 1,000 ' },
      { kind: 'empty' },
    ]);
  });
});
