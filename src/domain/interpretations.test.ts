import { describe, expect, it } from 'vitest';
import { createAnalysis } from './analysis';
import type { EvaInputs } from './evaTypes';
import { interpretMetric, summarizePerformance } from './interpretations';
import { METRIC_DEFINITIONS } from './metricDefinitions';
import type { MetricKey } from './metricDefinitions';

const FIXTURE: EvaInputs = { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 };

function analysis(inputs: Partial<EvaInputs> = {}) {
  return createAnalysis('USD', { ...FIXTURE, ...inputs });
}

const ALL_METRICS = Object.keys(METRIC_DEFINITIONS) as MetricKey[];

describe('interpretMetric', () => {
  it('interprets the documented fixture', () => {
    const result = analysis();
    expect(interpretMetric('cv', result)).toEqual({
      tone: 'unfavorable',
      text: 'Over budget for the work performed: the completed work cost $7,000.00 more than its budgeted value.',
    });
    expect(interpretMetric('cpi', result).tone).toBe('unfavorable');
    expect(interpretMetric('spi', result).text).toBe(
      'Behind schedule in earned-value terms: work is being completed at 0.8750 times the planned rate.',
    );
    expect(interpretMetric('eac', result).text).toBe(
      'If current cost efficiency continues, the project is forecast to cost $120,000.00, $20,000.00 above the approved budget of $100,000.00.',
    );
    expect(interpretMetric('vac', result).tone).toBe('unfavorable');
    expect(interpretMetric('budgetUtilization', result).text).toBe(
      '42.0% of the total approved budget has been spent.',
    );
  });

  it('compares CPI and SPI with 1.00 and CV and SV with zero', () => {
    expect(interpretMetric('cpi', analysis({ ev: 42_000 })).tone).toBe('neutral');
    expect(interpretMetric('cv', analysis({ ev: 42_000 })).tone).toBe('neutral');
    expect(interpretMetric('cpi', analysis({ ev: 50_000 })).tone).toBe('favorable');
    expect(interpretMetric('spi', analysis({ ev: 40_000 })).tone).toBe('neutral');
    expect(interpretMetric('spi', analysis({ ev: 60_000 })).text).toMatch(/^Ahead of schedule/);
    expect(interpretMetric('sv', analysis({ ev: 60_000 })).tone).toBe('favorable');
  });

  it('explains undefined metrics instead of interpreting them', () => {
    const zeroAc = analysis({ ac: 0 });
    for (const metric of ['cpi', 'eac', 'etc', 'vac', 'tcpiEac'] as const) {
      const interpretation = interpretMetric(metric, zeroAc);
      expect(interpretation.tone).toBe('undefined');
      expect(interpretation.text).toContain('Actual Cost (AC) is zero');
    }
    expect(interpretMetric('spi', analysis({ pv: 0 })).text).toContain(
      'Planned Value (PV) is zero',
    );
  });

  it('explains negative and zero TCPI without claiming achievability', () => {
    expect(interpretMetric('tcpiBac', analysis({ ac: 150_000 })).text).toMatch(
      /^Spending already exceeds the approved budget/,
    );
    expect(interpretMetric('tcpiBac', analysis({ ev: 100_000 })).text).toMatch(/^No work remains/);
    expect(interpretMetric('tcpiBac', analysis()).text).toContain('not whether it is achievable');
  });

  it('never produces NaN or Infinity text for boundary inputs', () => {
    const cases: Partial<EvaInputs>[] = [
      { pv: 0, ev: 0, ac: 0 },
      { ac: 100_000 },
      { ev: 100_000, pv: 100_000 },
      { bac: 1, pv: 1, ev: 1, ac: 9_007_199_254_740_991 },
      { bac: 9_007_199_254_740_991, pv: 0, ev: 1e-9, ac: 9_007_199_254_740_991 },
    ];
    for (const inputs of cases) {
      const result = analysis(inputs);
      for (const metric of ALL_METRICS) {
        expect(interpretMetric(metric, result).text).not.toMatch(/NaN|Infinity/);
      }
    }
  });
});

describe('summarizePerformance', () => {
  it('uses CPI and SPI for the headline', () => {
    const summary = summarizePerformance(analysis());
    expect(summary.cost).toMatchObject({ label: 'Unfavorable', tone: 'unfavorable' });
    expect(summary.schedule).toMatchObject({ label: 'Unfavorable', tone: 'unfavorable' });
    expect(summarizePerformance(analysis({ ev: 42_000, pv: 42_000 })).cost.label).toBe('On plan');
  });

  it('marks undefined indices as not assessable and explains CV or SV separately', () => {
    const summary = summarizePerformance(analysis({ ac: 0, pv: 0 }));
    expect(summary.cost.label).toBe('Not assessable');
    expect(summary.cost.text).toContain('Cost Variance (CV): Under budget for the work performed');
    expect(summary.schedule.label).toBe('Not assessable');
    expect(summary.schedule.text).toContain('Schedule Variance (SV)');
    expect(summary.forecast).toContain('EAC cannot be calculated');
  });
});

describe('CPI and SPI at the displayed precision (A1)', () => {
  // AC (or PV) = 100,000 and EV varies, or the reverse, giving ratios around 1.0000.
  const cases = [
    { label: 'just below', ev: 99_994, base: 100_000, shown: '0.9999', tone: 'unfavorable' },
    { label: 'rounds up to 1', ev: 99_996, base: 100_000, shown: '1.0000', tone: 'neutral' },
    { label: 'exactly 1', ev: 100_000, base: 100_000, shown: '1.0000', tone: 'neutral' },
    { label: 'rounds down to 1', ev: 100_000, base: 99_996, shown: '1.0000', tone: 'neutral' },
    { label: 'just above', ev: 100_000, base: 99_994, shown: '1.0001', tone: 'favorable' },
  ] as const;

  for (const { label, ev, base, shown, tone } of cases) {
    it(`classifies CPI ${label} 1 as shown (${shown})`, () => {
      const result = analysis({ bac: 200_000, pv: 100_000, ev, ac: base });
      expect(result.metrics.cpi.status === 'defined' && result.metrics.cpi.value).toBe(ev / base);
      const interpretation = interpretMetric('cpi', result);
      expect(interpretation.tone).toBe(tone);
      if (tone !== 'neutral') expect(interpretation.text).toContain(shown);
    });

    it(`classifies SPI ${label} 1 as shown (${shown})`, () => {
      const result = analysis({ bac: 200_000, pv: base, ev, ac: 100_000 });
      expect(interpretMetric('spi', result).tone).toBe(tone);
    });
  }

  it('resolves the audited example consistently', () => {
    const result = analysis({ bac: 100_000, pv: 50_000, ev: 49_999.99, ac: 50_000 });
    // The calculation is unchanged: CPI is slightly below 1.
    expect(result.metrics.cpi).toEqual({ status: 'defined', value: 49_999.99 / 50_000 });
    expect(interpretMetric('cpi', result)).toEqual({
      tone: 'neutral',
      text: 'Cost efficiency is 1.0000 at four decimal places: earned value and actual cost are effectively equal.',
    });
    expect(summarizePerformance(result).cost.label).toBe('On plan');
    // CV is shown in currency and stays unfavorable: -$0.01 is visible at its own precision.
    expect(interpretMetric('cv', result).tone).toBe('unfavorable');
  });

  it('keeps the exact-equality wording only for an exact 1', () => {
    expect(interpretMetric('cpi', analysis({ ev: 42_000, ac: 42_000 })).text).toBe(
      'Cost efficiency matches earned value: earned value equals actual cost.',
    );
    expect(interpretMetric('spi', analysis({ bac: 200_000, pv: 100_000, ev: 99_996 })).text).toBe(
      'Schedule performance is 1.0000 at four decimal places: earned value and planned value are effectively equal.',
    );
  });

  it('describes a tiny non-zero CPI without showing 0.0000 (A2)', () => {
    const result = analysis({
      bac: 9_007_199_254_740_991,
      pv: 1,
      ev: 1,
      ac: 9_007_199_254_740_991,
    });
    const text = interpretMetric('cpi', result).text;
    expect(text).toContain('<0.0001');
    expect(text).not.toContain('0.0000');
  });
});
