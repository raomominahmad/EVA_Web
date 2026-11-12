import { describe, expect, it } from 'vitest';
import { createAnalysis } from './analysis';
import { calculateBudgetComparison } from './budgetComparison';
import { calculateEvaMetrics } from './calculateEvaMetrics';
import { formatCurrency, formatPercent } from './formatting';
import { interpretBudgetVariance } from './interpretations';

function percent(bac: number, ac: number) {
  const result = calculateBudgetComparison({ bac, ac }).budgetVariancePercent;
  if (result.status !== 'defined') throw new Error('Expected a defined percentage');
  return result.value;
}

describe('calculateBudgetComparison', () => {
  // Fixtures from docs/EVA_FORMULAS.md §10.5.
  it.each([
    { bac: 100_000, ac: 42_000, variance: 58_000, pct: 58, label: 'AC below BAC' },
    { bac: 100_000, ac: 0, variance: 100_000, pct: 100, label: 'AC equal to zero' },
    { bac: 100_000, ac: 100_000, variance: 0, pct: 0, label: 'AC equal to BAC' },
    { bac: 100_000, ac: 150_000, variance: -50_000, pct: -50, label: 'AC above BAC' },
  ])('$label', ({ bac, ac, variance, pct }) => {
    expect(calculateBudgetComparison({ bac, ac })).toEqual({
      estimatedCost: bac,
      actualCost: ac,
      budgetVariance: variance,
      budgetVariancePercent: { status: 'defined', value: pct },
    });
  });

  it('keeps full precision and rounds only for display', () => {
    const value = percent(3, 1);
    expect(value).toBe(200 / 3);
    expect(formatPercent(value)).toBe('66.7%');
  });

  it('never clamps a negative variance', () => {
    const comparison = calculateBudgetComparison({ bac: 1, ac: 9_007_199_254_740_991 });
    expect(comparison.budgetVariance).toBe(1 - 9_007_199_254_740_991);
    expect(comparison.budgetVariancePercent.status).toBe('defined');
  });

  it('is undefined rather than infinite if BAC were zero', () => {
    expect(calculateBudgetComparison({ bac: 0, ac: 5 }).budgetVariancePercent).toEqual({
      status: 'undefined',
      reason: 'budgetZero',
    });
  });

  it('formats with the selected currency, including negative values', () => {
    const { budgetVariance } = calculateBudgetComparison({ bac: 100_000, ac: 150_000 });
    expect(formatCurrency(budgetVariance, 'USD')).toBe('-$50,000.00');
    expect(formatCurrency(budgetVariance, 'JPY')).toBe('-¥50,000');
    expect(formatPercent(percent(100_000, 150_000))).toBe('-50.0%');
  });

  it('stays separate from Cost Variance and EAC', () => {
    const analysis = createAnalysis('USD', { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 });
    expect(analysis.budget.budgetVariance).toBe(58_000);
    expect(analysis.metrics.cv).toBe(-7_000);
    expect(analysis.metrics.eac).toEqual({ status: 'defined', value: 120_000 });
    // The EVA metrics are exactly those of the unchanged calculation engine.
    expect(analysis.metrics).toEqual(
      calculateEvaMetrics({ bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 }),
    );
  });
});

describe('interpretBudgetVariance', () => {
  const interpret = (bac: number, ac: number) =>
    interpretBudgetVariance(createAnalysis('USD', { bac, pv: 0, ev: 0, ac })).text;

  it('describes budget remaining, an exact match, and spending above the budget', () => {
    expect(interpret(100_000, 42_000)).toBe(
      'Budget remaining: spending to date is $58,000.00 (58.0% of the budget) below the total approved budget.',
    );
    expect(interpret(100_000, 100_000)).toBe(
      'Spending to date equals the total approved budget; no budget remains.',
    );
    expect(interpret(100_000, 150_000)).toBe(
      'Spending above total budget: spending to date already exceeds the total approved budget by $50,000.00 (50.0% of the budget).',
    );
  });

  it('is always neutral, never favorable or unfavorable', () => {
    for (const ac of [0, 42_000, 100_000, 150_000]) {
      expect(
        interpretBudgetVariance(createAnalysis('USD', { bac: 100_000, pv: 0, ev: 0, ac })).tone,
      ).toBe('neutral');
    }
  });
});
