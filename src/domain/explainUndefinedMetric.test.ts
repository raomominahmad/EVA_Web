import { describe, expect, it } from 'vitest';
import { calculateEvaMetrics } from './calculateEvaMetrics';
import { UNDEFINABLE_METRICS } from './evaTypes';
import type { EvaInputs, UndefinableMetric } from './evaTypes';
import { explainUndefinedMetric } from './explainUndefinedMetric';

function explanations(inputs: EvaInputs): Partial<Record<UndefinableMetric, string>> {
  const metrics = calculateEvaMetrics(inputs);
  const result: Partial<Record<UndefinableMetric, string>> = {};

  for (const metric of UNDEFINABLE_METRICS) {
    const value = metrics[metric];

    if (value.status === 'undefined') {
      result[metric] = explainUndefinedMetric(metric, value.reason);
    }
  }

  return result;
}

describe('explainUndefinedMetric', () => {
  it('explains CPI and its dependent forecasts when AC = 0', () => {
    const result = explanations({ bac: 1000, pv: 500, ev: 400, ac: 0 });

    expect(Object.keys(result).sort()).toEqual(['cpi', 'eac', 'etc', 'tcpiEac', 'vac']);
    expect(result.cpi).toBe(
      'CPI cannot be calculated. Actual Cost (AC) is zero, so CPI = EV / AC would divide by zero.',
    );
    expect(result.eac).toBe(
      'EAC cannot be calculated. EAC requires a defined, non-zero CPI. Actual Cost (AC) is zero, so CPI = EV / AC would divide by zero.',
    );
    expect(result.vac).toContain('VAC depends on EAC, which requires a defined, non-zero CPI.');
  });

  it('explains the forecast when EV = 0', () => {
    const result = explanations({ bac: 1000, pv: 200, ev: 0, ac: 150 });

    expect(result.cpi).toBeUndefined();
    expect(result.etc).toContain('Earned Value (EV) is zero');
  });

  it('explains SPI when PV = 0', () => {
    expect(explanations({ bac: 1000, pv: 0, ev: 100, ac: 120 }).spi).toBe(
      'SPI cannot be calculated. Planned Value (PV) is zero, so SPI = EV / PV would divide by zero.',
    );
  });

  it('explains TCPI against BAC when AC = BAC', () => {
    expect(explanations({ bac: 1000, pv: 900, ev: 800, ac: 1000 }).tcpiBac).toContain(
      'TCPI against BAC cannot be calculated. Actual Cost (AC) equals BAC',
    );
  });

  it('explains TCPI against EAC when EV = BAC', () => {
    const result = explanations({ bac: 1000, pv: 1000, ev: 1000, ac: 1100 });

    expect(Object.keys(result)).toEqual(['tcpiEac']);
    expect(result.tcpiEac).toContain('Earned Value (EV) equals BAC, so no work remains');
  });

  it('returns no explanations when every metric is defined', () => {
    expect(explanations({ bac: 100000, pv: 40000, ev: 35000, ac: 42000 })).toEqual({});
  });

  it('never produces raw NaN or Infinity text', () => {
    const result = explanations({ bac: 1000, pv: 0, ev: 0, ac: 0 });

    for (const text of Object.values(result)) {
      expect(text).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe('UNDEFINABLE_METRICS', () => {
  it('lists every metric that can be undefined exactly once', () => {
    const metrics = calculateEvaMetrics({ bac: 1, pv: 1, ev: 1, ac: 1 });
    const resultKeys = Object.keys(metrics).filter((key) => key !== 'cv' && key !== 'sv');

    expect([...UNDEFINABLE_METRICS].sort()).toEqual(resultKeys.sort());
  });
});
