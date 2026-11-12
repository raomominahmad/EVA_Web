import type { Analysis } from '@/domain/analysis';
import { EVA_INPUT_DEFINITIONS } from '@/domain/evaTypes';
import type { EvaInputField, MetricResult } from '@/domain/evaTypes';
import { formatCurrency, formatPercent, formatRatio } from '@/domain/formatting';
import { BUDGET_DEFINITIONS, METRIC_DEFINITIONS } from '@/domain/metricDefinitions';
import type { MetricKey, MetricUnit } from '@/domain/metricDefinitions';
import type { Assessment, EvidenceKey } from './aiSummaryApi';

export interface EvidenceFact {
  /** Short label: the standard abbreviation, or the name when there is none. */
  label: string;
  /** Full name, for assistive technology and tooltips. */
  name: string;
  /** Formatted from the browser's own analysis, never from the AI response (`UI_WORKFLOW.md` §8.1). */
  display: string;
}

function format(unit: MetricUnit, value: number | MetricResult, analysis: Analysis): string {
  if (unit === 'currency') return formatCurrency(value, analysis.currency);
  return unit === 'index' ? formatRatio(value) : formatPercent(value);
}

function isInput(key: EvidenceKey): key is EvaInputField {
  return key in EVA_INPUT_DEFINITIONS;
}

function isMetric(key: EvidenceKey): key is MetricKey {
  return key in METRIC_DEFINITIONS;
}

/** The label and deterministic value of an evidence key, from the same definitions as the report. */
export function describeEvidence(key: EvidenceKey, analysis: Analysis): EvidenceFact {
  if (isInput(key)) {
    const { symbol, name } = EVA_INPUT_DEFINITIONS[key];
    return {
      label: symbol,
      name,
      display: formatCurrency(analysis.inputs[key], analysis.currency),
    };
  }
  if (isMetric(key)) {
    const { symbol, name, unit } = METRIC_DEFINITIONS[key];
    return { label: symbol ?? name, name, display: format(unit, analysis.metrics[key], analysis) };
  }
  const { name } = BUDGET_DEFINITIONS[key];
  return key === 'budgetVariance'
    ? {
        label: name,
        name,
        display: formatCurrency(analysis.budget.budgetVariance, analysis.currency),
      }
    : { label: name, name, display: formatPercent(analysis.budget.budgetVariancePercent) };
}

export const ASSESSMENT_LABELS: Record<Assessment, string> = {
  favorable: 'Favorable',
  unfavorable: 'Unfavorable',
  neutral: 'Neutral',
  notAssessable: 'Not assessable',
};
