import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/features/import/csv/parseCsv';
import { escapeCsvField, neutralizeFormula, number, serializeCsv, text } from './csv';

describe('neutralizeFormula', () => {
  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '＝1', '＋1', '－1', '＠a', '\tx', '\rx'])(
    'prefixes %j',
    (value) => {
      expect(neutralizeFormula(value)).toBe(`'${value}`);
    },
  );

  it.each(['  =1', ' \t+1', '\n-1', ' @a', '  ＝1'])(
    'prefixes %j after leading whitespace',
    (value) => {
      expect(neutralizeFormula(value)).toBe(`'${value}`);
    },
  );

  it('neutralizes formatted negative amounts', () => {
    expect(neutralizeFormula('-$7,000.00')).toBe("'-$7,000.00");
  });

  it.each(['Billing platform', 'N/A', '', 'A-1', 'x=1', 'CV = EV − AC', '−7000', "'quoted"])(
    'leaves %j unchanged',
    (value) => {
      expect(neutralizeFormula(value)).toBe(value);
    },
  );
});

describe('escapeCsvField', () => {
  it('quotes fields with commas, quotes, and line breaks and doubles quotes', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('one\ntwo')).toBe('"one\ntwo"');
    expect(escapeCsvField('one\r\ntwo')).toBe('"one\r\ntwo"');
  });
});

describe('serializeCsv', () => {
  it('neutralizes before escaping, so a protected value is still quoted correctly', () => {
    expect(serializeCsv([[text('=HYPERLINK("x","y")')]])).toBe(`"'=HYPERLINK(""x"",""y"")"\r\n`);
    expect(serializeCsv([[text('\r\n=1')]])).toBe(`"'\r\n=1"\r\n`);
  });

  it('writes numbers exactly, including negative raw values, without protection', () => {
    expect(serializeCsv([[number(-7000), number(0.8333333333333334), number(-0)]])).toBe(
      '-7000,0.8333333333333334,0\r\n',
    );
  });

  it('refuses to write non-finite numbers', () => {
    expect(() => serializeCsv([[number(Number.NaN)]])).toThrow(RangeError);
    expect(() => serializeCsv([[number(Number.POSITIVE_INFINITY)]])).toThrow(RangeError);
  });

  it('uses CRLF after every row and round-trips through an RFC 4180 parser', () => {
    const rows = [
      [text('Name'), text('Note')],
      [text('Billing, "core"'), text('line one\nline two')],
      [text('-x'), number(-5)],
    ];
    const csv = serializeCsv(rows);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(4); // three rows and the final CRLF; the LF is data
    const parsed = parseCsv(csv, 50);
    expect(parsed).toEqual({
      ok: true,
      records: [
        ['Name', 'Note'],
        ['Billing, "core"', 'line one\nline two'],
        ["'-x", '-5'],
      ],
    });
  });
});
