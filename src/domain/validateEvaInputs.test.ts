import { describe, expect, it } from 'vitest';
import type { EvaInputDraft } from './evaTypes';
import { isValidEvaInputValues, validateEvaInputs } from './validateEvaInputs';

function draft(overrides: Partial<EvaInputDraft> = {}): EvaInputDraft {
  return {
    currency: 'USD',
    bac: '100,000',
    pv: '40,000',
    ev: '35,000',
    ac: '42,000',
    ...overrides,
  };
}

function errorCodes(input: EvaInputDraft) {
  const result = validateEvaInputs(input);

  if (result.ok) {
    throw new Error('Expected validation to fail');
  }

  return Object.fromEntries(
    Object.entries(result.errors).map(([field, error]) => [field, error.code]),
  );
}

describe('validateEvaInputs', () => {
  it('returns parsed inputs and the currency for valid values', () => {
    expect(validateEvaInputs(draft())).toEqual({
      ok: true,
      currency: 'USD',
      inputs: { bac: 100000, pv: 40000, ev: 35000, ac: 42000 },
    });
  });

  it('requires an explicit currency', () => {
    expect(errorCodes(draft({ currency: '' }))).toEqual({ currency: 'currencyRequired' });
  });

  it('rejects an unsupported currency', () => {
    expect(errorCodes(draft({ currency: 'XYZ' }))).toEqual({ currency: 'currencyUnsupported' });
  });

  it('reports every blank field without coercing it to zero', () => {
    expect(errorCodes(draft({ bac: '', pv: '', ev: '', ac: '' }))).toEqual({
      bac: 'required',
      pv: 'required',
      ev: 'required',
      ac: 'required',
    });
  });

  it('requires BAC to be greater than zero', () => {
    expect(errorCodes(draft({ bac: '0', pv: '0', ev: '0', ac: '0' }))).toEqual({
      bac: 'bacNotPositive',
    });
  });

  it('rejects PV and EV above BAC', () => {
    expect(errorCodes(draft({ pv: '100,000.01', ev: '150000' }))).toEqual({
      pv: 'exceedsBac',
      ev: 'exceedsBac',
    });
  });

  it('allows PV and EV to equal BAC', () => {
    expect(validateEvaInputs(draft({ pv: '100000', ev: '100000' })).ok).toBe(true);
  });

  it('allows EV above PV', () => {
    expect(validateEvaInputs(draft({ pv: '20000', ev: '35000' })).ok).toBe(true);
  });

  it('allows AC above BAC', () => {
    expect(validateEvaInputs(draft({ ac: '250000' })).ok).toBe(true);
  });

  it('allows PV and AC to be zero', () => {
    expect(validateEvaInputs(draft({ pv: '0', ac: '0' }))).toEqual({
      ok: true,
      currency: 'USD',
      inputs: { bac: 100000, pv: 0, ev: 35000, ac: 0 },
    });
  });

  it('skips BAC comparisons when BAC itself is invalid', () => {
    expect(errorCodes(draft({ bac: 'abc', pv: '5000000' }))).toEqual({ bac: 'notANumber' });
  });

  it('reports parse errors per field', () => {
    expect(errorCodes(draft({ pv: '-1', ev: '1e4', ac: '1,00' }))).toEqual({
      pv: 'negative',
      ev: 'exponential',
      ac: 'malformedGrouping',
    });
  });

  it('provides readable messages that name the field', () => {
    const result = validateEvaInputs(draft({ currency: '', pv: '200000', ac: '' }));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.currency?.message).toBe('Select the currency used for all four values.');
      expect(result.errors.pv?.message).toBe(
        "PV cannot exceed BAC under this application's baseline assumptions.",
      );
      expect(result.errors.ac?.message).toBe('Enter the Actual Cost (AC).');
    }
  });

  it('states the maximum supported amount', () => {
    const result = validateEvaInputs(draft({ bac: '9007199254740992' }));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.bac?.message).toContain('9,007,199,254,740,991');
    }
  });
});

describe('isValidEvaInputValues', () => {
  const valid = { bac: 100000, pv: 40000, ev: 35000, ac: 42000 };

  it('accepts values that satisfy the validation rules', () => {
    expect(isValidEvaInputValues(valid, 'USD')).toBe(true);
    expect(isValidEvaInputValues({ ...valid, ev: 60000, ac: 150000 }, 'USD')).toBe(true);
    expect(isValidEvaInputValues({ ...valid, pv: 0, ac: 0 }, 'USD')).toBe(true);
    expect(isValidEvaInputValues({ ...valid, ev: 0.01 }, 'USD')).toBe(true);
    expect(isValidEvaInputValues({ ...valid, ev: 0.001 }, 'KWD')).toBe(true);
    expect(isValidEvaInputValues({ ...valid, ac: Number.MAX_SAFE_INTEGER }, 'JPY')).toBe(true);
  });

  it('rejects values that break the validation rules', () => {
    expect(isValidEvaInputValues({ ...valid, bac: 0, pv: 0, ev: 0 }, 'USD')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, pv: 100001 }, 'USD')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, ev: 100001 }, 'USD')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, ac: -1 }, 'USD')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, ac: Number.NaN }, 'USD')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, ac: Number.POSITIVE_INFINITY }, 'USD')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, ac: Number.MAX_SAFE_INTEGER + 2 }, 'USD')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, ac: '42000' }, 'USD')).toBe(false);
  });

  it("rejects numbers with more decimal places than the currency's minor unit", () => {
    // Previously accepted: 0.0000001 has seven decimal places, which no currency supports.
    expect(isValidEvaInputValues({ ...valid, ev: 0.0000001 }, 'USD')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, ev: 0.005 }, 'USD')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, ev: 0.5 }, 'JPY')).toBe(false);
    expect(isValidEvaInputValues({ ...valid, ev: 0.0005 }, 'KWD')).toBe(false);
    // A spreadsheet result such as 0.1 + 0.2 is not an amount in cents.
    expect(isValidEvaInputValues({ ...valid, ev: 0.1 + 0.2 }, 'USD')).toBe(false);
  });
});

describe('validateEvaInputs — precision (D4)', () => {
  function messageFor(input: EvaInputDraft, field: 'bac' | 'pv' | 'ev' | 'ac') {
    const result = validateEvaInputs(input);
    if (result.ok) throw new Error('Expected validation to fail');
    return result.errors[field]?.message;
  }

  it("accepts amounts within the currency's decimal places", () => {
    expect(validateEvaInputs(draft({ ac: '42,000.05' })).ok).toBe(true);
    expect(validateEvaInputs(draft({ ac: '42,000.50000' })).ok).toBe(true);
    expect(validateEvaInputs(draft({ currency: 'KWD', ac: '42,000.125' })).ok).toBe(true);
    expect(validateEvaInputs(draft({ currency: 'JPY', ac: '42,000' })).ok).toBe(true);
    expect(validateEvaInputs(draft({ ac: '0' })).ok).toBe(true);
  });

  it('rejects extra decimal places with a currency-specific message', () => {
    expect(messageFor(draft({ ac: '100.125' }), 'ac')).toBe(
      'AC can have at most 2 decimal places in USD.',
    );
    expect(messageFor(draft({ currency: 'JPY', ac: '100.5' }), 'ac')).toBe(
      'AC cannot have decimal places in JPY.',
    );
    expect(messageFor(draft({ currency: 'KWD', pv: '1.0005' }), 'pv')).toBe(
      'PV can have at most 3 decimal places in KWD.',
    );
  });

  it('rejects the audited example instead of rounding it', () => {
    expect(errorCodes(draft({ bac: '9007199254740990.5' }))).toEqual({ bac: 'tooPrecise' });
    expect(messageFor(draft({ bac: '9007199254740990.5' }), 'bac')).toBe(
      'BAC has too many digits to be stored exactly. Use at most 15 significant digits, or a whole number up to 9,007,199,254,740,991.',
    );
  });

  it('keeps the existing maximum for whole numbers', () => {
    expect(validateEvaInputs(draft({ bac: '9,007,199,254,740,991' })).ok).toBe(true);
    expect(errorCodes(draft({ bac: '9,007,199,254,740,992' }))).toEqual({ bac: 'tooLarge' });
    expect(errorCodes(draft({ bac: '9007199254740991.01' }))).toEqual({ bac: 'tooLarge' });
  });
});
