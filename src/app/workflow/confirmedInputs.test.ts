import { describe, expect, it } from 'vitest';
import { hasUnconfirmedChanges } from './confirmedInputs';
import type { ConfirmedInputs } from './workflowTypes';

const CONFIRMED: ConfirmedInputs = {
  currency: 'USD',
  inputs: { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 },
};

const DRAFT = { currency: 'USD', bac: '100,000', pv: '40000', ev: '35000.00', ac: '42000' };

describe('hasUnconfirmedChanges', () => {
  it('treats formatting differences of the same numbers as unchanged', () => {
    expect(hasUnconfirmedChanges(DRAFT, CONFIRMED)).toBe(false);
  });

  it('detects changed amounts, a changed currency, and an invalid or blank draft', () => {
    expect(hasUnconfirmedChanges({ ...DRAFT, ac: '42001' }, CONFIRMED)).toBe(true);
    expect(hasUnconfirmedChanges({ ...DRAFT, currency: 'EUR' }, CONFIRMED)).toBe(true);
    expect(hasUnconfirmedChanges({ ...DRAFT, pv: '' }, CONFIRMED)).toBe(true);
    expect(hasUnconfirmedChanges({ ...DRAFT, ev: 'abc' }, CONFIRMED)).toBe(true);
  });
});
