import { describe, expect, it } from 'vitest';
import { parseMonetaryInput } from '@/domain/parseMonetaryInput';
import { toPlainDecimal } from './toPlainDecimal';

describe('toPlainDecimal', () => {
  it('writes ordinary numbers unchanged', () => {
    expect(toPlainDecimal(100000)).toBe('100000');
    expect(toPlainDecimal(1234.56)).toBe('1234.56');
    expect(toPlainDecimal(0)).toBe('0');
  });

  it('expands exponent notation', () => {
    expect(toPlainDecimal(1e-7)).toBe('0.0000001');
    expect(toPlainDecimal(1.5e-10)).toBe('0.00000000015');
    expect(toPlainDecimal(1e21)).toBe('1000000000000000000000');
    expect(toPlainDecimal(-2.5e-8)).toBe('-0.000000025');
  });

  it('produces text that the monetary parser reads back as the same number', () => {
    for (const value of [1e-7, 0.1, 123456.789, 9007199254740991, 3.14159e-9]) {
      expect(parseMonetaryInput(toPlainDecimal(value))).toEqual({ ok: true, value });
    }
  });

  it('leaves non-finite values for the parser to reject', () => {
    expect(toPlainDecimal(Number.POSITIVE_INFINITY)).toBe('Infinity');
    expect(parseMonetaryInput(toPlainDecimal(Number.NaN)).ok).toBe(false);
  });
});
