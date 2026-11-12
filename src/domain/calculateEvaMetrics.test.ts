import { describe, expect, it } from 'vitest';
import { calculateEvaMetrics, divide } from './calculateEvaMetrics';
import { UNDEFINABLE_METRICS } from './evaTypes';
import type { EvaInputs, MetricResult, UndefinedReason } from './evaTypes';

function valueOf(result: MetricResult): number {
  if (result.status !== 'defined') {
    throw new Error(`Expected a defined metric, got undefined (${result.reason})`);
  }

  return result.value;
}

function undefinedBecause(reason: UndefinedReason): MetricResult {
  return { status: 'undefined', reason };
}

describe('divide', () => {
  it('divides normally', () => {
    expect(divide(3, 4, 'actualCostZero')).toEqual({ status: 'defined', value: 0.75 });
  });

  it('returns the given reason for a zero denominator, including 0 / 0', () => {
    expect(divide(1, 0, 'plannedValueZero')).toEqual(undefinedBecause('plannedValueZero'));
    expect(divide(-1, 0, 'plannedValueZero')).toEqual(undefinedBecause('plannedValueZero'));
    expect(divide(0, 0, 'actualCostZero')).toEqual(undefinedBecause('actualCostZero'));
  });

  it('returns notFinite when the quotient overflows', () => {
    expect(divide(Number.MAX_VALUE, 0.5, 'budgetZero')).toEqual(undefinedBecause('notFinite'));
  });
});

describe('calculateEvaMetrics', () => {
  it('matches the known-good fixture in docs/EVA_FORMULAS.md', () => {
    const metrics = calculateEvaMetrics({ bac: 100000, pv: 40000, ev: 35000, ac: 42000 });

    expect(metrics.cv).toBe(-7000);
    expect(metrics.sv).toBe(-5000);
    expect(valueOf(metrics.cpi)).toBeCloseTo(0.8333333333, 10);
    expect(valueOf(metrics.spi)).toBe(0.875);
    expect(valueOf(metrics.eac)).toBeCloseTo(120000, 6);
    expect(valueOf(metrics.etc)).toBeCloseTo(78000, 6);
    expect(valueOf(metrics.vac)).toBeCloseTo(-20000, 6);
    expect(valueOf(metrics.tcpiBac)).toBeCloseTo(1.1206896552, 10);
    expect(valueOf(metrics.tcpiEac)).toBeCloseTo(0.8333333333, 10);
    expect(valueOf(metrics.plannedCompletion)).toBeCloseTo(40, 10);
    expect(valueOf(metrics.earnedCompletion)).toBeCloseTo(35, 10);
    expect(valueOf(metrics.budgetUtilization)).toBeCloseTo(42, 10);
  });

  it('keeps negative variances unclamped', () => {
    const metrics = calculateEvaMetrics({ bac: 1000, pv: 800, ev: 100, ac: 900 });

    expect(metrics.cv).toBe(-800);
    expect(metrics.sv).toBe(-700);
    expect(valueOf(metrics.vac)).toBeCloseTo(-8000, 6);
  });

  describe('AC = 0 with EV > 0', () => {
    it.each<EvaInputs>([
      { bac: 1000, pv: 500, ev: 400, ac: 0 },
      { bac: 1000, pv: 0, ev: 0.01, ac: 0 },
      { bac: 1000, pv: 1000, ev: 1000, ac: 0 },
      { bac: Number.MAX_SAFE_INTEGER, pv: 1, ev: Number.MAX_SAFE_INTEGER, ac: 0 },
    ])('makes CPI and every CPI-based forecast undefined for %o', (inputs) => {
      const metrics = calculateEvaMetrics(inputs);
      const acZero = undefinedBecause('actualCostZero');

      expect(metrics.cpi).toEqual(acZero);
      expect(metrics.eac).toEqual(acZero);
      expect(metrics.etc).toEqual(acZero);
      expect(metrics.vac).toEqual(acZero);
      expect(metrics.tcpiEac).toEqual(acZero);
    });

    it('does not report a zero EAC, even though BAC × AC / EV would be 0', () => {
      const metrics = calculateEvaMetrics({ bac: 1000, pv: 500, ev: 400, ac: 0 });

      expect(metrics.eac.status).toBe('undefined');
      expect(metrics.etc.status).toBe('undefined');
    });

    it('keeps metrics that do not depend on CPI', () => {
      const metrics = calculateEvaMetrics({ bac: 1000, pv: 500, ev: 400, ac: 0 });

      expect(metrics.cv).toBe(400);
      expect(valueOf(metrics.spi)).toBe(0.8);
      expect(valueOf(metrics.tcpiBac)).toBeCloseTo(0.6, 10);
      expect(valueOf(metrics.budgetUtilization)).toBe(0);
    });
  });

  it('attributes AC = 0 and EV = 0 to the zero actual cost', () => {
    const metrics = calculateEvaMetrics({ bac: 1000, pv: 0, ev: 0, ac: 0 });

    expect(metrics.cpi).toEqual(undefinedBecause('actualCostZero'));
    expect(metrics.eac).toEqual(undefinedBecause('actualCostZero'));
    expect(metrics.spi).toEqual(undefinedBecause('plannedValueZero'));
  });

  it('treats EV = 0 with AC > 0 as CPI 0 and an undefined forecast', () => {
    const metrics = calculateEvaMetrics({ bac: 1000, pv: 200, ev: 0, ac: 150 });
    const evZero = undefinedBecause('earnedValueZero');

    expect(valueOf(metrics.cpi)).toBe(0);
    expect(valueOf(metrics.spi)).toBe(0);
    expect(metrics.eac).toEqual(evZero);
    expect(metrics.etc).toEqual(evZero);
    expect(metrics.vac).toEqual(evZero);
    expect(metrics.tcpiEac).toEqual(evZero);
  });

  it('treats PV = 0 as undefined SPI without affecting cost metrics', () => {
    const metrics = calculateEvaMetrics({ bac: 1000, pv: 0, ev: 100, ac: 120 });

    expect(metrics.sv).toBe(100);
    expect(metrics.spi).toEqual(undefinedBecause('plannedValueZero'));
    expect(valueOf(metrics.cpi)).toBeCloseTo(100 / 120, 10);
    expect(valueOf(metrics.plannedCompletion)).toBe(0);
  });

  it('treats BAC = AC as undefined TCPI against BAC', () => {
    const metrics = calculateEvaMetrics({ bac: 1000, pv: 900, ev: 800, ac: 1000 });

    expect(metrics.tcpiBac).toEqual(undefinedBecause('budgetEqualsActualCost'));
    expect(valueOf(metrics.eac)).toBeCloseTo(1250, 10);
  });

  it('treats EV = BAC as zero ETC and undefined TCPI against EAC', () => {
    const metrics = calculateEvaMetrics({ bac: 1000, pv: 1000, ev: 1000, ac: 1100 });

    expect(valueOf(metrics.etc)).toBe(0);
    expect(valueOf(metrics.eac)).toBeCloseTo(1100, 10);
    expect(metrics.tcpiEac).toEqual(undefinedBecause('workComplete'));
    expect(valueOf(metrics.earnedCompletion)).toBe(100);
  });

  it('preserves a negative TCPI against BAC when AC exceeds BAC', () => {
    const metrics = calculateEvaMetrics({ bac: 1000, pv: 600, ev: 500, ac: 1200 });

    expect(valueOf(metrics.tcpiBac)).toBeCloseTo(-2.5, 10);
    expect(valueOf(metrics.budgetUtilization)).toBeCloseTo(120, 10);
  });

  it('allows EV above PV', () => {
    const metrics = calculateEvaMetrics({ bac: 1000, pv: 300, ev: 500, ac: 500 });

    expect(metrics.sv).toBe(200);
    expect(valueOf(metrics.spi)).toBeCloseTo(5 / 3, 10);
    expect(valueOf(metrics.cpi)).toBe(1);
    expect(valueOf(metrics.vac)).toBe(0);
  });

  it('reports BAC = 0 explicitly if called with unvalidated inputs', () => {
    const metrics = calculateEvaMetrics({ bac: 0, pv: 0, ev: 0, ac: 0 });

    expect(metrics.plannedCompletion).toEqual(undefinedBecause('budgetZero'));
    expect(metrics.tcpiBac).toEqual(undefinedBecause('budgetEqualsActualCost'));
  });

  it('never produces NaN or Infinity, and EAC is defined only when CPI is defined and non-zero', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const bacValues = [0.01, 1, 1000, max];
    const fractions = [0, 1e-9, 0.5, 1];
    const acValues = [0, 0.01, 1, 1000, max];

    for (const bac of bacValues) {
      for (const pvFraction of fractions) {
        for (const evFraction of fractions) {
          for (const ac of acValues) {
            const metrics = calculateEvaMetrics({
              bac,
              pv: bac * pvFraction,
              ev: bac * evFraction,
              ac,
            });

            expect(Number.isFinite(metrics.cv)).toBe(true);
            expect(Number.isFinite(metrics.sv)).toBe(true);

            for (const metric of UNDEFINABLE_METRICS) {
              const result = metrics[metric];

              if (result.status === 'defined') {
                expect(Number.isFinite(result.value)).toBe(true);
              }
            }

            const cpiUsable = metrics.cpi.status === 'defined' && metrics.cpi.value !== 0;

            expect(metrics.eac.status === 'defined').toBe(cpiUsable);
            expect(metrics.etc.status).toBe(metrics.eac.status);
            expect(metrics.vac.status).toBe(metrics.eac.status);

            if (metrics.eac.status === 'undefined') {
              expect(metrics.tcpiEac.status).toBe('undefined');
            }
          }
        }
      }
    }
  });
});
