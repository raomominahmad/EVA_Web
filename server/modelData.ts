import type { Analysis } from '../src/domain/analysis.ts';
import { EVA_INPUT_DEFINITIONS, EVA_INPUT_FIELDS } from '../src/domain/evaTypes.ts';
import type { MetricResult } from '../src/domain/evaTypes.ts';
import { formatCurrency, formatPercent, formatRatio } from '../src/domain/formatting.ts';
import { interpretBudgetVariance, interpretMetric } from '../src/domain/interpretations.ts';
import type { Tone } from '../src/domain/interpretations.ts';
import {
  ASSUMPTIONS,
  BUDGET_COMPARISON_NOTE,
  BUDGET_DEFINITIONS,
  METRIC_DEFINITIONS,
} from '../src/domain/metricDefinitions.ts';
import type { MetricKey, MetricUnit } from '../src/domain/metricDefinitions.ts';
import type { EvidenceKey } from './contract.ts';

interface FactBase {
  key: EvidenceKey;
  symbol?: string;
  name: string;
  kind: 'input' | 'metric' | 'budgetComparison';
  formula?: string;
}

/** A defined value: the report's own display string and, for results, its deterministic reading. */
export interface DefinedFact extends FactBase {
  status: 'defined';
  display: string;
  tone?: Exclude<Tone, 'undefined'>;
  interpretation?: string;
}

/** An undefined result carries only its explanation: no value, no zero, no substitute. */
export interface UndefinedFact extends FactBase {
  status: 'undefined';
  explanation: string;
}

export type Fact = DefinedFact | UndefinedFact;

/** The data document sent to the model (`DECISIONS.md` §8.5.3). */
export interface ModelData {
  currency: Analysis['currency'];
  facts: Fact[];
  rules: {
    assumptions: readonly string[];
    budgetVarianceNote: string;
  };
}

const METRIC_ORDER: readonly MetricKey[] = [
  'cv',
  'sv',
  'cpi',
  'spi',
  'eac',
  'etc',
  'vac',
  'tcpiBac',
  'tcpiEac',
  'plannedCompletion',
  'earnedCompletion',
  'budgetUtilization',
];

function formatByUnit(value: number | MetricResult, unit: MetricUnit, analysis: Analysis): string {
  switch (unit) {
    case 'currency':
      return formatCurrency(value, analysis.currency);
    case 'index':
      return formatRatio(value);
    case 'percent':
      return formatPercent(value);
  }
}

function metricFact(key: MetricKey, analysis: Analysis): Fact {
  const definition = METRIC_DEFINITIONS[key];
  const value = analysis.metrics[key];
  const interpretation = interpretMetric(key, analysis);
  const base: FactBase = {
    key,
    ...(definition.symbol === null ? {} : { symbol: definition.symbol }),
    name: definition.name,
    kind: 'metric',
    formula: definition.formula,
  };

  if (typeof value !== 'number' && value.status === 'undefined') {
    return { ...base, status: 'undefined', explanation: interpretation.text };
  }
  if (interpretation.tone === 'undefined') {
    // Unreachable: a defined value always has a defined tone. Fail rather than send a mismatch.
    throw new Error('Inconsistent interpretation for a defined metric.');
  }
  return {
    ...base,
    status: 'defined',
    display: formatByUnit(value, definition.unit, analysis),
    tone: interpretation.tone,
    interpretation: interpretation.text,
  };
}

function budgetFacts(analysis: Analysis): Fact[] {
  const { budgetVariance, budgetVariancePercent } = analysis.budget;
  const interpretation = interpretBudgetVariance(analysis);
  const varianceFact: Fact = {
    key: 'budgetVariance',
    name: BUDGET_DEFINITIONS.budgetVariance.name,
    kind: 'budgetComparison',
    formula: BUDGET_DEFINITIONS.budgetVariance.formula,
    status: 'defined',
    display: formatCurrency(budgetVariance, analysis.currency),
    tone: 'neutral',
    interpretation: interpretation.text,
  };
  const percentBase: FactBase = {
    key: 'budgetVariancePercent',
    name: BUDGET_DEFINITIONS.budgetVariancePercent.name,
    kind: 'budgetComparison',
    formula: BUDGET_DEFINITIONS.budgetVariancePercent.formula,
  };
  const percentFact: Fact =
    budgetVariancePercent.status === 'defined'
      ? { ...percentBase, status: 'defined', display: formatPercent(budgetVariancePercent) }
      : // Unreachable for validated inputs (BAC > 0); kept explicit rather than shown as zero.
        {
          ...percentBase,
          status: 'undefined',
          explanation: 'BAC is zero, so it cannot be calculated.',
        };
  return [varianceFact, percentFact];
}

/**
 * Builds the model's data document from a derived analysis. Every value is the report's own
 * formatted display string, every interpretation is the deterministic one, and undefined metrics
 * keep their explanation without any value. No project metadata or user text is included.
 */
export function buildModelData(analysis: Analysis): ModelData {
  const inputFacts: Fact[] = EVA_INPUT_FIELDS.map((field) => ({
    key: field,
    symbol: EVA_INPUT_DEFINITIONS[field].symbol,
    name: EVA_INPUT_DEFINITIONS[field].name,
    kind: 'input',
    status: 'defined',
    display: formatCurrency(analysis.inputs[field], analysis.currency),
  }));

  return {
    currency: analysis.currency,
    facts: [
      ...inputFacts,
      ...METRIC_ORDER.map((key) => metricFact(key, analysis)),
      ...budgetFacts(analysis),
    ],
    rules: { assumptions: ASSUMPTIONS, budgetVarianceNote: BUDGET_COMPARISON_NOTE },
  };
}
