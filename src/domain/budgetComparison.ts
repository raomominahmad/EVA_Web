import { divide } from './calculateEvaMetrics';
import type { EvaInputs, MetricResult } from './evaTypes';

/**
 * Budget-versus-actual comparison (`docs/EVA_FORMULAS.md` §10). Compares spending to date with
 * the total approved budget. It is not EVA Cost Variance (CV = EV − AC) and does not measure cost
 * efficiency.
 */
export interface BudgetComparison {
  /** Estimated cost: the approved budget, BAC (not the forecast EAC). */
  estimatedCost: number;
  /** Actual cost to the reporting date, AC. */
  actualCost: number;
  /** BAC − AC. Always defined for finite inputs; negative when AC exceeds BAC. */
  budgetVariance: number;
  /** ((BAC − AC) / BAC) × 100, already on the 0–100 scale. Undefined only if BAC were zero. */
  budgetVariancePercent: MetricResult;
}

/** Calculates the comparison at full precision. Values are never clamped or rounded. */
export function calculateBudgetComparison({
  bac,
  ac,
}: Pick<EvaInputs, 'bac' | 'ac'>): BudgetComparison {
  const budgetVariance = bac - ac;
  // Multiplying before dividing is algebraically identical to ((BAC − AC) / BAC) × 100 and keeps
  // results exact for ordinary inputs (58000 × 100 / 100000 = 58, whereas 0.58 × 100 ≠ 58).
  const budgetVariancePercent = divide(budgetVariance * 100, bac, 'budgetZero');

  return {
    estimatedCost: bac,
    actualCost: ac,
    budgetVariance,
    budgetVariancePercent,
  };
}
