import { getCurrencyFractionDigits, isSupportedCurrency } from './currency';
import type { CurrencyCode } from './currency';
import { EVA_INPUT_DEFINITIONS, EVA_INPUT_FIELDS } from './evaTypes';
import type { EvaInputDraft, EvaInputField, EvaInputs } from './evaTypes';
import {
  isExactMonetaryValue,
  MAX_MONETARY_INPUT,
  MAX_SIGNIFICANT_DIGITS,
  parseMonetaryInput,
} from './parseMonetaryInput';
import type { MonetaryParseError } from './parseMonetaryInput';

type MonetaryFieldErrorCode = MonetaryParseError | 'bacNotPositive' | 'exceedsBac';

export type EvaValidationErrorCode =
  MonetaryFieldErrorCode | 'currencyRequired' | 'currencyUnsupported';

export interface EvaValidationError {
  code: EvaValidationErrorCode;
  message: string;
}

export type EvaValidationErrors = Partial<Record<EvaInputField | 'currency', EvaValidationError>>;

export type EvaValidationResult =
  | { ok: true; currency: CurrencyCode; inputs: EvaInputs }
  | { ok: false; errors: EvaValidationErrors };

const MAX_INPUT_DISPLAY = MAX_MONETARY_INPUT.toLocaleString('en-US');

function decimalPlaces(count: number): string {
  return count === 1 ? '1 decimal place' : `${count} decimal places`;
}

function fieldError(
  field: EvaInputField,
  code: MonetaryFieldErrorCode,
  currency?: CurrencyCode,
): EvaValidationError {
  const { symbol, name } = EVA_INPUT_DEFINITIONS[field];

  switch (code) {
    case 'required':
      return { code, message: `Enter the ${name} (${symbol}).` };
    case 'negative':
      return { code, message: `${symbol} cannot be negative.` };
    case 'exponential':
      return {
        code,
        message: `Enter ${symbol} as a plain number, without exponential notation such as 1e5.`,
      };
    case 'malformedGrouping':
      return {
        code,
        message: `Check the thousands separators in ${symbol}. Use groups of three digits, for example 1,250,000.`,
      };
    case 'notANumber':
      return { code, message: `Enter ${symbol} as a number, for example 125000 or 125,000.50.` };
    case 'tooLarge':
      return {
        code,
        message: `${symbol} is too large. The maximum supported amount is ${MAX_INPUT_DISPLAY}.`,
      };
    case 'tooManyDecimals': {
      const digits = currency === undefined ? 0 : getCurrencyFractionDigits(currency);
      return {
        code,
        message:
          digits === 0
            ? `${symbol} cannot have decimal places in ${currency ?? 'this currency'}.`
            : `${symbol} can have at most ${decimalPlaces(digits)} in ${currency ?? 'this currency'}.`,
      };
    }
    case 'tooPrecise':
      return {
        code,
        message: `${symbol} has too many digits to be stored exactly. Use at most ${MAX_SIGNIFICANT_DIGITS} significant digits, or a whole number up to ${MAX_INPUT_DISPLAY}.`,
      };
    case 'bacNotPositive':
      return { code, message: 'BAC must be greater than zero.' };
    case 'exceedsBac':
      return {
        code,
        message: `${symbol} cannot exceed BAC under this application's baseline assumptions.`,
      };
  }
}

/**
 * Checks already-parsed values against the same rules as `validateEvaInputs`, including the
 * currency's decimal places and exact representation. Used for values that did not come from the
 * form: confirmed inputs restored from storage and the backend's request.
 */
export function isValidEvaInputValues(
  values: Record<EvaInputField, unknown>,
  currency: CurrencyCode,
): values is EvaInputs {
  const { bac, pv, ev, ac } = values;
  const digits = getCurrencyFractionDigits(currency);
  const isValidAmount = (value: unknown): value is number =>
    typeof value === 'number' && isExactMonetaryValue(value, digits);

  return (
    isValidAmount(bac) &&
    isValidAmount(pv) &&
    isValidAmount(ev) &&
    isValidAmount(ac) &&
    bac > 0 &&
    pv <= bac &&
    ev <= bac
  );
}

export type EvaAmountsDraft = Record<EvaInputField, string>;

export type EvaAmountErrors = Partial<Record<EvaInputField, EvaValidationError>>;

export type EvaAmountsResult =
  { ok: true; inputs: EvaInputs } | { ok: false; errors: EvaAmountErrors };

/**
 * Validates the four monetary amounts (parsing plus BAC, PV, and EV limits). Shared by manual
 * entry and file import, so both apply identical rules. With a `currency`, decimal places are
 * limited to its minor unit; without one (no currency chosen yet, or an imported row without a
 * currency), that check waits until the currency is known, as every other check still applies.
 */
export function validateEvaAmounts(
  draft: EvaAmountsDraft,
  currency?: CurrencyCode,
): EvaAmountsResult {
  const fractionDigits = currency === undefined ? undefined : getCurrencyFractionDigits(currency);
  const errors: EvaAmountErrors = {};
  const parsed: Partial<EvaInputs> = {};

  for (const field of EVA_INPUT_FIELDS) {
    const result = parseMonetaryInput(draft[field], fractionDigits);

    if (result.ok) {
      parsed[field] = result.value;
    } else {
      errors[field] = fieldError(field, result.error, currency);
    }
  }

  const { bac, pv, ev, ac } = parsed;

  if (bac !== undefined && bac <= 0) {
    errors.bac = fieldError('bac', 'bacNotPositive');
  }

  // Cross-field limits are only meaningful against a valid BAC.
  if (bac !== undefined && !errors.bac) {
    if (pv !== undefined && pv > bac) {
      errors.pv = fieldError('pv', 'exceedsBac');
    }

    if (ev !== undefined && ev > bac) {
      errors.ev = fieldError('ev', 'exceedsBac');
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    bac === undefined ||
    pv === undefined ||
    ev === undefined ||
    ac === undefined
  ) {
    return { ok: false, errors };
  }

  return { ok: true, inputs: { bac, pv, ev, ac } };
}

/**
 * Validates the raw EVA input draft according to `docs/EVA_FORMULAS.md` §5 and
 * `docs/DECISIONS.md` §3–4. Returns parsed numbers only when every field is valid.
 */
export function validateEvaInputs(draft: EvaInputDraft): EvaValidationResult {
  const errors: EvaValidationErrors = {};

  if (draft.currency.trim() === '') {
    errors.currency = {
      code: 'currencyRequired',
      message: 'Select the currency used for all four values.',
    };
  } else if (!isSupportedCurrency(draft.currency)) {
    errors.currency = { code: 'currencyUnsupported', message: 'Select a currency from the list.' };
  }

  const amounts = validateEvaAmounts(
    draft,
    isSupportedCurrency(draft.currency) ? draft.currency : undefined,
  );

  if (!amounts.ok) {
    Object.assign(errors, amounts.errors);
  }

  if (!amounts.ok || errors.currency || !isSupportedCurrency(draft.currency)) {
    return { ok: false, errors };
  }

  return { ok: true, currency: draft.currency, inputs: amounts.inputs };
}
