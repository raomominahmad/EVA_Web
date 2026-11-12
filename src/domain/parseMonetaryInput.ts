export const MAX_MONETARY_INPUT = Number.MAX_SAFE_INTEGER;

/**
 * Amounts with a fractional part may have at most this many significant digits. Any decimal with
 * 15 or fewer significant digits converts to a JavaScript number and back unchanged (IEEE 754
 * double precision guarantees 15), so the stored number is exactly the amount that was entered.
 * Whole numbers are exact up to `MAX_MONETARY_INPUT` regardless of their digit count.
 */
export const MAX_SIGNIFICANT_DIGITS = 15;

export type MonetaryParseError =
  | 'required'
  | 'negative'
  | 'exponential'
  | 'malformedGrouping'
  | 'notANumber'
  | 'tooLarge'
  /** More decimal places than the currency's minor unit (ISO 4217). */
  | 'tooManyDecimals'
  /** More significant digits than a number can hold exactly; it would be silently rounded. */
  | 'tooPrecise';

export type MonetaryParseResult =
  { ok: true; value: number } | { ok: false; error: MonetaryParseError };

// 1234, 1234.5, 1234., .5
const PLAIN_NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
// 1,234 and 12,345,678.90; the first group has 1-3 digits without a leading zero.
const GROUPED_NUMBER = /^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d*)?$/;
const NEGATIVE_NUMBER = /^[-−]\s*[\d.,]/;
const EXPONENTIAL_NUMBER = /^[+-]?[\d,]*\.?\d*[eE][+-]?\d+$/;
const DIGITS_AND_SEPARATORS = /^[\d,.]+$/;

/**
 * Parses a monetary amount typed by the user. Leading and trailing whitespace is ignored;
 * nothing else is coerced, clamped, or rounded.
 *
 * The size and precision checks run on the decimal text, before any conversion to a number, so a
 * value is never rounded first and checked afterwards (`DECISIONS.md` §3):
 *
 * - `fractionDigits` (the currency's minor unit), when given, limits the decimal places. Trailing
 *   zeros beyond it do not change the amount and are accepted (`10.500` in USD is 10.50).
 * - The amount must not exceed `MAX_MONETARY_INPUT`.
 * - An amount with a fractional part may have at most `MAX_SIGNIFICANT_DIGITS` significant digits.
 *
 * An accepted amount converts to a number whose shortest decimal form is exactly the entered
 * amount (without grouping, leading zeros, or trailing fractional zeros).
 */
export function parseMonetaryInput(raw: string, fractionDigits?: number): MonetaryParseResult {
  const text = raw.trim();

  if (text === '') {
    return { ok: false, error: 'required' };
  }

  if (NEGATIVE_NUMBER.test(text)) {
    return { ok: false, error: 'negative' };
  }

  if (EXPONENTIAL_NUMBER.test(text)) {
    return { ok: false, error: 'exponential' };
  }

  if (!PLAIN_NUMBER.test(text) && !GROUPED_NUMBER.test(text)) {
    const looksGrouped = text.includes(',') && DIGITS_AND_SEPARATORS.test(text);

    return { ok: false, error: looksGrouped ? 'malformedGrouping' : 'notANumber' };
  }

  const plain = text.replaceAll(',', '');
  const [integerText = '', fractionText = ''] = plain.split('.');
  const integer = integerText.replace(/^0+/, '');
  const fraction = fractionText.replace(/0+$/, '');

  if (fractionDigits !== undefined && fraction.length > fractionDigits) {
    return { ok: false, error: 'tooManyDecimals' };
  }

  // Compared as integers, so an amount just above the maximum is not rounded down into range.
  const whole = BigInt(integer === '' ? '0' : integer);
  const max = BigInt(MAX_MONETARY_INPUT);
  if (whole > max || (whole === max && fraction !== '')) {
    return { ok: false, error: 'tooLarge' };
  }

  if (fraction !== '' && (integer + fraction).replace(/^0+/, '').length > MAX_SIGNIFICANT_DIGITS) {
    return { ok: false, error: 'tooPrecise' };
  }

  const value = Number(plain);
  const canonical = `${integer === '' ? '0' : integer}${fraction === '' ? '' : `.${fraction}`}`;

  // Guard: the number must read back as exactly the entered amount. Implied by the checks above;
  // kept so that no future change to them can let a silently rounded value through. JavaScript
  // writes numbers below 1e-6 in exponent form (`1e-7`); those are covered by the digit limit
  // alone, and every currency's decimal places reject them anyway.
  const shortest = String(value);
  if (!shortest.includes('e') && shortest !== canonical) {
    return { ok: false, error: 'tooPrecise' };
  }

  return { ok: true, value };
}

/**
 * Whether an already-parsed number is an amount the parser would accept for a currency with
 * `fractionDigits` decimal places. Used for values that did not come from text: confirmed inputs
 * restored from storage and the backend's JSON request, so every path applies the same rule.
 */
export function isExactMonetaryValue(value: number, fractionDigits: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  // `String` gives the shortest decimal that identifies the number; an exponent form such as
  // `1e-7` has more decimal places than any currency allows.
  const text = String(value);
  return PLAIN_NUMBER.test(text) && parseMonetaryInput(text, fractionDigits).ok;
}
