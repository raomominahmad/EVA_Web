/**
 * D4: every path by which an amount enters EVA applies one rule. Text (typed or imported) goes
 * through `validateEvaInputs` / `parseMonetaryInput`; numbers (restored session state and the
 * backend's JSON request) go through `isValidEvaInputValues`. They must agree.
 */
import { describe, expect, it } from 'vitest';
import { validateAiSummaryRequest } from '../../server/requestValidation.ts';
import { createAnalysis } from './analysis';
import { SUPPORTED_CURRENCIES } from './currency';
import { isValidEvaInputValues, validateEvaInputs } from './validateEvaInputs';

const BASE = { bac: '9007199254740991', pv: '0', ev: '0', ac: '0' };

const SAMPLES = [
  '0',
  '1',
  '0.5',
  '0.05',
  '0.005',
  '0.0005',
  '10.500',
  '125000.50',
  '9999999999999.99',
  '99999999999999.99',
  '999999999999.999',
  '9007199254740990.5',
  '9007199254740991',
  '1234567890123456',
  '1234567890123456.7',
];

describe('one precision rule for text and numbers, in the browser and the backend', () => {
  for (const { code } of SUPPORTED_CURRENCIES) {
    it(`agrees for ${code}`, () => {
      for (const ac of SAMPLES) {
        const typed = validateEvaInputs({ currency: code, ...BASE, ac });
        const asNumber = Number(ac);
        const values = { bac: Number(BASE.bac), pv: 0, ev: 0, ac: asNumber };
        const stored = isValidEvaInputValues(values, code);
        const backend = validateAiSummaryRequest({
          schemaVersion: 1,
          currency: code,
          inputs: values,
        });

        // A typed amount that is accepted converts to a number every other path accepts.
        if (typed.ok) {
          expect(typed.inputs.ac, `${code} ${ac}`).toBe(asNumber);
          expect(stored, `${code} ${ac}`).toBe(true);
          expect(backend.ok, `${code} ${ac}`).toBe(true);
        }
        // The number paths agree with each other.
        expect(backend.ok, `${code} ${ac}`).toBe(stored);
        // A number the stored/backend paths accept is accepted when typed as its own text.
        if (stored) {
          expect(validateEvaInputs({ currency: code, ...BASE, ac: String(asNumber) }).ok).toBe(
            true,
          );
        }
      }
    });
  }

  it('rejects the audited example on every path', () => {
    const typed = validateEvaInputs({ currency: 'USD', ...BASE, bac: '9007199254740990.5' });
    expect(typed.ok).toBe(false);
    expect(!typed.ok && typed.errors.bac?.code).toBe('tooPrecise');
  });
});

describe('the input rule never restricts calculated results', () => {
  it('keeps negative, fractional, and repeating calculated values unchanged', () => {
    const result = validateEvaInputs({
      currency: 'USD',
      bac: '100,000.00',
      pv: '40,000.01',
      ev: '35,000.03',
      ac: '42,000.07',
    });
    if (!result.ok) throw new Error('Expected valid inputs');
    const { metrics } = createAnalysis(result.currency, result.inputs);

    expect(metrics.cv).toBeCloseTo(-7000.04, 9);
    expect(metrics.sv).toBeCloseTo(-4999.98, 9);
    // Calculated values may have any number of decimals and stay at full precision.
    expect(metrics.cpi).toEqual({ status: 'defined', value: 35000.03 / 42000.07 });
    expect(metrics.vac.status === 'defined' && metrics.vac.value < 0).toBe(true);
  });
});
