import { describe, expect, it } from 'vitest';
import { isExactMonetaryValue, MAX_MONETARY_INPUT, parseMonetaryInput } from './parseMonetaryInput';

describe('parseMonetaryInput', () => {
  it.each([
    ['0', 0],
    ['125000', 125000],
    ['125000.50', 125000.5],
    ['0.75', 0.75],
    ['.5', 0.5],
    ['12.', 12],
    ['007', 7],
    ['1,000', 1000],
    ['1,234,567.89', 1234567.89],
    ['999,999', 999999],
    ['  42  ', 42],
    ['9007199254740991', MAX_MONETARY_INPUT],
    ['9,007,199,254,740,991', MAX_MONETARY_INPUT],
  ])('accepts %j as %d', (raw, expected) => {
    expect(parseMonetaryInput(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(['', '   ', '\t'])('rejects blank input %j as required', (raw) => {
    expect(parseMonetaryInput(raw)).toEqual({ ok: false, error: 'required' });
  });

  it.each(['-1', '-0', '- 5', '-1,000', '−50', '-.5'])('rejects negative input %j', (raw) => {
    expect(parseMonetaryInput(raw)).toEqual({ ok: false, error: 'negative' });
  });

  it.each(['1e5', '1E5', '2.5e-3', '1,000e2', '+1e5'])('rejects exponential notation %j', (raw) => {
    expect(parseMonetaryInput(raw)).toEqual({ ok: false, error: 'exponential' });
  });

  it.each([
    '1,23,4',
    '12,34',
    '1,0000',
    ',100',
    '100,',
    '1,,000',
    '0,100',
    '1,000.00,0',
    '1.000,50',
  ])('rejects malformed grouping %j', (raw) => {
    expect(parseMonetaryInput(raw)).toEqual({ ok: false, error: 'malformedGrouping' });
  });

  it.each([
    'abc',
    '12abc',
    '$100',
    '1 000',
    '1.2.3',
    '.',
    '+5',
    'NaN',
    'Infinity',
    '0x10',
    '1_000',
  ])('rejects non-numeric input %j', (raw) => {
    expect(parseMonetaryInput(raw)).toEqual({ ok: false, error: 'notANumber' });
  });

  it.each(['9007199254740992', '9,007,199,254,740,992', '1'.padEnd(400, '0')])(
    'rejects values above Number.MAX_SAFE_INTEGER',
    (raw) => {
      expect(parseMonetaryInput(raw)).toEqual({ ok: false, error: 'tooLarge' });
    },
  );
});

describe('parseMonetaryInput — precision (D4)', () => {
  it('rejects the audited example instead of silently rounding it', () => {
    // Number('9007199254740990.5') is 9007199254740990: the .5 would be lost.
    expect(parseMonetaryInput('9007199254740990.5')).toEqual({ ok: false, error: 'tooPrecise' });
    expect(parseMonetaryInput('9007199254740990.5', 2)).toEqual({
      ok: false,
      error: 'tooPrecise',
    });
  });

  it('accepts amounts with a fractional part up to 15 significant digits', () => {
    for (const [raw, value] of [
      ['9999999999999.99', 9999999999999.99],
      ['9,999,999,999,999.99', 9999999999999.99],
      ['999999999999.999', 999999999999.999],
      ['0.01', 0.01],
      ['12345678901234.5', 12345678901234.5],
    ] as const) {
      expect(parseMonetaryInput(raw)).toEqual({ ok: true, value });
    }
  });

  it('rejects amounts with a fractional part beyond 15 significant digits', () => {
    for (const raw of [
      '99999999999999.99',
      '1234567890123456.7',
      '123456789012345.6',
      '0.1234567890123456',
      '9007199254740991.0000001',
    ]) {
      const result = parseMonetaryInput(raw);
      expect(result.ok).toBe(false);
    }
    expect(parseMonetaryInput('99999999999999.99')).toEqual({ ok: false, error: 'tooPrecise' });
  });

  it('keeps whole numbers exact up to Number.MAX_SAFE_INTEGER, and rejects anything above', () => {
    expect(parseMonetaryInput('9007199254740991', 0)).toEqual({
      ok: true,
      value: MAX_MONETARY_INPUT,
    });
    expect(parseMonetaryInput('9007199254740991.00', 2)).toEqual({
      ok: true,
      value: MAX_MONETARY_INPUT,
    });
    expect(parseMonetaryInput('1234567890123456')).toEqual({ ok: true, value: 1234567890123456 });
    // Compared as text, not after rounding: these would otherwise become 9007199254740992.
    expect(parseMonetaryInput('9007199254740991.5')).toEqual({ ok: false, error: 'tooLarge' });
    expect(parseMonetaryInput('9007199254740991.01', 2)).toEqual({ ok: false, error: 'tooLarge' });
    expect(parseMonetaryInput('9007199254740993')).toEqual({ ok: false, error: 'tooLarge' });
  });

  it("limits decimal places to the currency's minor unit, ignoring trailing zeros", () => {
    expect(parseMonetaryInput('125000.50', 2)).toEqual({ ok: true, value: 125000.5 });
    expect(parseMonetaryInput('125000.505', 2)).toEqual({ ok: false, error: 'tooManyDecimals' });
    expect(parseMonetaryInput('10.500', 2)).toEqual({ ok: true, value: 10.5 });
    expect(parseMonetaryInput('1500', 0)).toEqual({ ok: true, value: 1500 });
    expect(parseMonetaryInput('1500.', 0)).toEqual({ ok: true, value: 1500 });
    expect(parseMonetaryInput('1500.00', 0)).toEqual({ ok: true, value: 1500 });
    expect(parseMonetaryInput('1500.5', 0)).toEqual({ ok: false, error: 'tooManyDecimals' });
    expect(parseMonetaryInput('1.125', 3)).toEqual({ ok: true, value: 1.125 });
    expect(parseMonetaryInput('1.1255', 3)).toEqual({ ok: false, error: 'tooManyDecimals' });
  });

  it('accepts zero and plain integers in every form', () => {
    for (const raw of ['0', '0.00', '.0', '000', '0.']) {
      expect(parseMonetaryInput(raw, 2)).toEqual({ ok: true, value: 0 });
    }
    expect(parseMonetaryInput('42', 0)).toEqual({ ok: true, value: 42 });
  });
});

describe('isExactMonetaryValue', () => {
  it('accepts exactly the numbers whose text the parser accepts for the currency', () => {
    const cases: [number, number, boolean][] = [
      [0, 2, true],
      [125000.5, 2, true],
      [0.01, 2, true],
      [0.001, 3, true],
      [0.001, 2, false],
      [0.5, 0, false],
      [0.1 + 0.2, 2, false],
      [1e-7, 3, false],
      [9999999999999.99, 2, true],
      [MAX_MONETARY_INPUT, 0, true],
      [MAX_MONETARY_INPUT + 1, 0, false],
      [-1, 2, false],
      [Number.NaN, 2, false],
      [Number.POSITIVE_INFINITY, 2, false],
    ];
    for (const [value, digits, expected] of cases) {
      expect(isExactMonetaryValue(value, digits)).toBe(expected);
      if (Number.isFinite(value) && value >= 0 && !String(value).includes('e')) {
        expect(parseMonetaryInput(String(value), digits).ok).toBe(expected);
      }
    }
  });
});
