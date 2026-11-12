import { describe, expect, it } from 'vitest';
import { getCurrencyFractionDigits, isSupportedCurrency, SUPPORTED_CURRENCIES } from './currency';
import {
  NOT_AVAILABLE,
  formatCurrency,
  formatPercent,
  formatRatio,
  ratioAtDisplayPrecision,
} from './formatting';

describe('formatCurrency', () => {
  it('formats amounts with the currency convention and en-US grouping', () => {
    expect(formatCurrency(100000, 'USD')).toBe('$100,000.00');
    expect(formatCurrency(1234.5, 'JPY')).toBe('¥1,235');
    expect(formatCurrency(1234.5678, 'KWD')).toMatch(/^KWD\s1,234\.568$/);
  });

  it('uses the ISO 4217 minor unit for PKR (2), even where the engine data differs', () => {
    expect(formatCurrency(1000, 'PKR')).toMatch(/^PKR\s1,000\.00$/);
    expect(formatCurrency(1234.567, 'PKR')).toMatch(/^PKR\s1,234\.57$/);
  });

  it('formats calculated metric results', () => {
    expect(formatCurrency({ status: 'defined', value: -20000 }, 'USD')).toBe('-$20,000.00');
    expect(formatCurrency({ status: 'undefined', reason: 'actualCostZero' }, 'USD')).toBe(
      NOT_AVAILABLE,
    );
  });

  it('shows negative amounts with a leading minus sign', () => {
    expect(formatCurrency(-7000, 'USD')).toBe('-$7,000.00');
  });

  it('does not render a negative zero after rounding', () => {
    expect(formatCurrency(-0.001, 'USD')).toBe('$0.00');
    expect(formatCurrency(-0, 'USD')).toBe('$0.00');
  });

  it('formats the maximum supported input', () => {
    expect(formatCurrency(Number.MAX_SAFE_INTEGER, 'EUR')).toBe('€9,007,199,254,740,991.00');
  });

  it('renders undefined and non-finite values as N/A', () => {
    expect(formatCurrency(null, 'USD')).toBe(NOT_AVAILABLE);
    expect(formatCurrency(Number.NaN, 'USD')).toBe(NOT_AVAILABLE);
    expect(formatCurrency(Number.POSITIVE_INFINITY, 'USD')).toBe(NOT_AVAILABLE);
  });
});

describe('formatRatio', () => {
  it('uses four decimal places', () => {
    expect(formatRatio(35000 / 42000)).toBe('0.8333');
    expect(formatRatio(65000 / 58000)).toBe('1.1207');
    expect(formatRatio(1)).toBe('1.0000');
    expect(formatRatio(12345.6)).toBe('12,345.6000');
  });

  it('keeps negative ratios and avoids negative zero', () => {
    expect(formatRatio(-2.5)).toBe('-2.5000');
    expect(formatRatio(-0)).toBe('0.0000');
    expect(formatRatio(0)).toBe('0.0000');
  });

  it('never shows a non-zero ratio as 0.0000 (A2)', () => {
    expect(formatRatio(1e-16)).toBe('<0.0001');
    expect(formatRatio(0.00004)).toBe('<0.0001');
    expect(formatRatio(-0.00001)).toBe('>-0.0001');
    // From 0.00005 the value rounds to 0.0001 and is shown normally.
    expect(formatRatio(0.00005)).toBe('0.0001');
    expect(formatRatio({ status: 'defined', value: 1e-16 })).toBe('<0.0001');
  });

  it('rounds for comparisons exactly as it displays', () => {
    expect(ratioAtDisplayPrecision(0.99995)).toBe(Number(formatRatio(0.99995)));
    expect(ratioAtDisplayPrecision(35_000 / 42_000)).toBe(0.8333);
    expect(ratioAtDisplayPrecision(1234.56789)).toBe(1234.5679);
    expect(ratioAtDisplayPrecision(49_999.99 / 50_000)).toBe(1);
  });

  it('renders undefined and non-finite values as N/A', () => {
    expect(formatRatio(null)).toBe(NOT_AVAILABLE);
    expect(formatRatio(Number.NaN)).toBe(NOT_AVAILABLE);
    expect(formatRatio(Number.NEGATIVE_INFINITY)).toBe(NOT_AVAILABLE);
    expect(formatRatio({ status: 'undefined', reason: 'plannedValueZero' })).toBe(NOT_AVAILABLE);
    expect(formatRatio({ status: 'defined', value: Number.NaN })).toBe(NOT_AVAILABLE);
  });
});

describe('formatPercent', () => {
  it('formats a 0–100 value with one decimal place and an explicit % sign', () => {
    expect(formatPercent(42)).toBe('42.0%');
    expect(formatPercent(100 / 3)).toBe('33.3%');
    expect(formatPercent(120)).toBe('120.0%');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('renders undefined and non-finite values as N/A', () => {
    expect(formatPercent(null)).toBe(NOT_AVAILABLE);
    expect(formatPercent(Number.NaN)).toBe(NOT_AVAILABLE);
    expect(formatPercent({ status: 'undefined', reason: 'budgetZero' })).toBe(NOT_AVAILABLE);
  });
});

describe('currency helpers', () => {
  it('recognises supported currency codes only', () => {
    expect(isSupportedCurrency('USD')).toBe(true);
    expect(isSupportedCurrency('usd')).toBe(false);
    expect(isSupportedCurrency('')).toBe(false);
  });

  it('resolves ISO 4217 fraction digits', () => {
    expect(getCurrencyFractionDigits('USD')).toBe(2);
    expect(getCurrencyFractionDigits('PKR')).toBe(2);
    expect(getCurrencyFractionDigits('JPY')).toBe(0);
    expect(getCurrencyFractionDigits('KWD')).toBe(3);
  });

  it('formats every supported currency with its ISO 4217 precision', () => {
    for (const { code, minorUnits } of SUPPORTED_CURRENCIES) {
      const formatted = formatCurrency(1, code);
      const decimals = formatted.split('.')[1]?.replace(/\D/g, '') ?? '';

      expect(decimals.length, code).toBe(minorUnits);
    }
  });

  it('lists unique currency codes', () => {
    const codes = SUPPORTED_CURRENCIES.map((currency) => currency.code);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('formatCurrency above Number.MAX_SAFE_INTEGER (A2)', () => {
  it('shows 15 significant digits for calculated amounts beyond any input', () => {
    const eac = (Number.MAX_SAFE_INTEGER * Number.MAX_SAFE_INTEGER) / 1;
    expect(formatCurrency(eac, 'JPY')).toBe('¥81,129,638,414,606,700,000,000,000,000,000');
    expect(formatCurrency(-eac, 'USD')).toBe('-$81,129,638,414,606,700,000,000,000,000,000');
  });

  it('leaves amounts up to the input maximum unchanged', () => {
    expect(formatCurrency(Number.MAX_SAFE_INTEGER, 'JPY')).toBe('¥9,007,199,254,740,991');
    expect(formatCurrency(-Number.MAX_SAFE_INTEGER, 'JPY')).toBe('-¥9,007,199,254,740,991');
    expect(formatCurrency(9_999_999_999_999.99, 'USD')).toBe('$9,999,999,999,999.99');
  });
});
