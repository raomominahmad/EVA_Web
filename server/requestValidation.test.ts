import { describe, expect, it } from 'vitest';
import { validateAiSummaryRequest } from './requestValidation';

const VALID = {
  schemaVersion: 1,
  currency: 'USD',
  inputs: { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 },
};

function withInputs(inputs: Record<string, unknown>) {
  return { ...VALID, inputs: { ...VALID.inputs, ...inputs } };
}

function codeOf(body: unknown) {
  const result = validateAiSummaryRequest(body);
  return result.ok ? 'ok' : result.code;
}

describe('validateAiSummaryRequest', () => {
  it('accepts a valid request and returns exactly the four inputs', () => {
    expect(validateAiSummaryRequest(VALID)).toEqual({ ok: true, request: VALID });
  });

  it('accepts every boundary the domain allows: zero PV, EV, AC; PV = EV = BAC; AC above BAC', () => {
    expect(codeOf(withInputs({ pv: 0, ev: 0, ac: 0 }))).toBe('ok');
    expect(codeOf(withInputs({ pv: 100_000, ev: 100_000 }))).toBe('ok');
    expect(codeOf(withInputs({ ac: 250_000 }))).toBe('ok');
    expect(codeOf(withInputs({ ev: 60_000 }))).toBe('ok'); // EV above PV is valid.
    expect(codeOf(withInputs({ bac: Number.MAX_SAFE_INTEGER }))).toBe('ok');
  });

  it.each([
    ['an array', [VALID]],
    ['null', null],
    ['a string', 'USD'],
  ])('rejects %s as the body', (_label, body) => {
    expect(codeOf(body)).toBe('invalid_request');
  });

  it('rejects missing properties', () => {
    const { currency: _currency, ...noCurrency } = VALID;
    expect(codeOf(noCurrency)).toBe('invalid_request');
    const { ac: _ac, ...noAc } = VALID.inputs;
    expect(codeOf({ ...VALID, inputs: noAc })).toBe('invalid_request');
  });

  it('rejects unknown properties, including project metadata and client-supplied metrics', () => {
    expect(codeOf({ ...VALID, projectName: 'Billing platform' })).toBe('invalid_request');
    expect(codeOf({ ...VALID, metrics: { cpi: 1.5 } })).toBe('invalid_request');
    expect(codeOf(withInputs({ cpi: 1.5 }))).toBe('invalid_request');
    expect(
      codeOf(
        JSON.parse(
          '{"schemaVersion":1,"currency":"USD","inputs":{"bac":1,"pv":0,"ev":0,"ac":0},"__proto__":{}}',
        ),
      ),
    ).toBe('invalid_request');
  });

  it.each([0, 2, '1', null])('rejects schemaVersion %j', (schemaVersion) => {
    expect(codeOf({ ...VALID, schemaVersion })).toBe('invalid_request');
  });

  it.each(['usd', 'XYZ', '', 840, null])('rejects currency %j', (currency) => {
    expect(codeOf({ ...VALID, currency })).toBe('invalid_request');
  });

  it.each([['"100000"'], ['null'], ['true'], ['{}']])(
    'rejects a non-number amount (%s) as a schema error',
    (json) => {
      expect(codeOf(withInputs({ bac: JSON.parse(json) as unknown }))).toBe('invalid_request');
    },
  );

  it('rejects negative amounts under the EVA rules', () => {
    for (const field of ['pv', 'ev', 'ac']) {
      expect(codeOf(withInputs({ [field]: -1 }))).toBe('invalid_inputs');
    }
  });

  it('rejects non-finite and unsafe amounts', () => {
    // JSON cannot express NaN; 1e400 parses to Infinity.
    expect(codeOf(withInputs({ ac: JSON.parse('1e400') as number }))).toBe('invalid_inputs');
    expect(codeOf(withInputs({ ac: Number.NaN }))).toBe('invalid_inputs');
    expect(codeOf(withInputs({ ac: Number.MAX_SAFE_INTEGER + 2 }))).toBe('invalid_inputs');
  });

  it('enforces BAC > 0, PV ≤ BAC, and EV ≤ BAC without clamping', () => {
    expect(codeOf(withInputs({ bac: 0, pv: 0, ev: 0, ac: 0 }))).toBe('invalid_inputs');
    expect(codeOf(withInputs({ pv: 100_001 }))).toBe('invalid_inputs');
    expect(codeOf(withInputs({ ev: 100_000.01 }))).toBe('invalid_inputs');
  });

  it('applies the same precision rule as the browser (D4)', () => {
    // Within the currency's decimal places and exact: accepted.
    expect(codeOf(withInputs({ ac: 42_000.05 }))).toBe('ok');
    expect(codeOf({ ...VALID, currency: 'KWD', inputs: { ...VALID.inputs, ac: 42_000.005 } })).toBe(
      'ok',
    );
    expect(
      codeOf({
        ...VALID,
        currency: 'JPY',
        inputs: { bac: Number.MAX_SAFE_INTEGER, pv: 0, ev: 0, ac: 0 },
      }),
    ).toBe('ok');

    // More decimal places than the currency allows, or not an exact amount: 422.
    expect(codeOf(withInputs({ ac: 42_000.005 }))).toBe('invalid_inputs');
    expect(codeOf({ ...VALID, currency: 'JPY', inputs: { ...VALID.inputs, ac: 0.5 } })).toBe(
      'invalid_inputs',
    );
    expect(codeOf(withInputs({ ev: 0.1 + 0.2 }))).toBe('invalid_inputs');
    expect(codeOf(withInputs({ ev: 1e-7 }))).toBe('invalid_inputs');
  });
});
