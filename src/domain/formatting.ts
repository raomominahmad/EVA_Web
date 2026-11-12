import { getCurrencyFractionDigits } from './currency';
import type { CurrencyCode } from './currency';
import type { MetricResult } from './evaTypes';

export const DISPLAY_LOCALE = 'en-US';
export const NOT_AVAILABLE = 'N/A';

const RATIO_FRACTION_DIGITS = 4;
const PERCENT_FRACTION_DIGITS = 1;

/** A raw number, a calculated metric result, or `null` for an absent value. */
export type FormattableValue = number | MetricResult | null;

const currencyFormatters = new Map<CurrencyCode, Intl.NumberFormat>();
const largeCurrencyFormatters = new Map<CurrencyCode, Intl.NumberFormat>();

/**
 * Significant digits shown for an amount above `Number.MAX_SAFE_INTEGER`. Only a calculated value
 * can be that large (inputs are capped), for example an EAC from a very small EV. A double holds
 * about 15–17 significant digits, so further digits would be noise; 15 keeps related amounts
 * (EAC, ETC, VAC) consistent with each other.
 */
const LARGE_AMOUNT_SIGNIFICANT_DIGITS = 15;

/** The smallest non-zero magnitude a ratio shows at four decimal places. */
const RATIO_DISPLAY_FLOOR = 10 ** -RATIO_FRACTION_DIGITS;

// signDisplay 'negative' prevents values that round to zero from rendering as "-0".
const ratioFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
  minimumFractionDigits: RATIO_FRACTION_DIGITS,
  maximumFractionDigits: RATIO_FRACTION_DIGITS,
  signDisplay: 'negative',
});

// The same rounding as `ratioFormatter`, without grouping, so the result parses as a number.
const plainRatioFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
  minimumFractionDigits: RATIO_FRACTION_DIGITS,
  maximumFractionDigits: RATIO_FRACTION_DIGITS,
  useGrouping: false,
});

const percentFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
  minimumFractionDigits: PERCENT_FRACTION_DIGITS,
  maximumFractionDigits: PERCENT_FRACTION_DIGITS,
  signDisplay: 'negative',
});

function getCurrencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency);

  if (!formatter) {
    // Fraction digits are set from ISO 4217 rather than the engine's data, which can differ.
    const fractionDigits = getCurrencyFractionDigits(currency);

    formatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      signDisplay: 'negative',
    });
    currencyFormatters.set(currency, formatter);
  }

  return formatter;
}

function getLargeCurrencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  let formatter = largeCurrencyFormatters.get(currency);

  if (!formatter) {
    formatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
      style: 'currency',
      currency,
      maximumSignificantDigits: LARGE_AMOUNT_SIGNIFICANT_DIGITS,
      signDisplay: 'negative',
    });
    largeCurrencyFormatters.set(currency, formatter);
  }

  return formatter;
}

function toDisplayNumber(value: FormattableValue): number | null {
  if (value === null) {
    return null;
  }

  const number =
    typeof value === 'number' ? value : value.status === 'defined' ? value.value : null;

  return number !== null && Number.isFinite(number) ? number : null;
}

/** Formats a monetary amount, e.g. `-$7,000.00`. Undefined values render as `N/A`. */
export function formatCurrency(value: FormattableValue, currency: CurrencyCode): string {
  const number = toDisplayNumber(value);

  if (number === null) return NOT_AVAILABLE;

  return Math.abs(number) > Number.MAX_SAFE_INTEGER
    ? getLargeCurrencyFormatter(currency).format(number)
    : getCurrencyFormatter(currency).format(number);
}

/**
 * Formats an index such as CPI, SPI, or TCPI to four decimal places, e.g. `0.8333`. A non-zero
 * value that would round to zero is shown as `<0.0001` (or `>-0.0001`), never as `0.0000`.
 */
export function formatRatio(value: FormattableValue): string {
  const number = toDisplayNumber(value);

  if (number === null) return NOT_AVAILABLE;
  if (number !== 0 && ratioAtDisplayPrecision(number) === 0) {
    return number > 0
      ? `<${ratioFormatter.format(RATIO_DISPLAY_FLOOR)}`
      : `>${ratioFormatter.format(-RATIO_DISPLAY_FLOOR)}`;
  }
  return ratioFormatter.format(number);
}

/**
 * A ratio rounded exactly as `formatRatio` shows it (four decimal places), as a number. Used to
 * classify a ratio against a benchmark at the precision the user sees.
 */
export function ratioAtDisplayPrecision(value: number): number {
  return Number(plainRatioFormatter.format(value));
}

/** Formats a value that is already a percentage (0–100 scale), e.g. `42.0%`. */
export function formatPercent(value: FormattableValue): string {
  const number = toDisplayNumber(value);

  return number === null ? NOT_AVAILABLE : `${percentFormatter.format(number)}%`;
}
