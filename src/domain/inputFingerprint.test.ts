import { describe, expect, it } from 'vitest';
import { inputFingerprint } from './inputFingerprint';

describe('inputFingerprint', () => {
  it('matches the documented example (PROJECT_REQUIREMENTS.md §11.5)', () => {
    expect(inputFingerprint('USD', { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 })).toBe(
      'v1:USD:100000:40000:35000:42000',
    );
  });

  it('uses String(number) in the order BAC, PV, EV, AC, regardless of property order', () => {
    expect(inputFingerprint('JPY', { ac: 0.5, ev: 0, pv: 1e21, bac: 1e21 })).toBe(
      'v1:JPY:1e+21:1e+21:0:0.5',
    );
  });

  it('changes whenever any input or the currency changes', () => {
    const base = { bac: 1000, pv: 0, ev: 0, ac: 0 };
    const values = new Set([
      inputFingerprint('USD', base),
      inputFingerprint('EUR', base),
      inputFingerprint('USD', { ...base, ac: 1 }),
      inputFingerprint('USD', { ...base, pv: 1 }),
    ]);
    expect(values.size).toBe(4);
  });
});
