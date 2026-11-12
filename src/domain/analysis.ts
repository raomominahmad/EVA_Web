import { calculateBudgetComparison } from './budgetComparison';
import type { BudgetComparison } from './budgetComparison';
import { calculateEvaMetrics } from './calculateEvaMetrics';
import type { CurrencyCode } from './currency';
import type { EvaInputs, EvaMetrics } from './evaTypes';

/**
 * The single analysis result read by the report, the charts, and the CSV export. It is always
 * recalculated from confirmed inputs and is never persisted. No consumer recalculates a metric.
 */
export interface Analysis {
  currency: CurrencyCode;
  inputs: EvaInputs;
  metrics: EvaMetrics;
  budget: BudgetComparison;
}

export function createAnalysis(currency: CurrencyCode, inputs: EvaInputs): Analysis {
  return {
    currency,
    inputs: { ...inputs },
    metrics: calculateEvaMetrics(inputs),
    budget: calculateBudgetComparison(inputs),
  };
}
