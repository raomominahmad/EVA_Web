import type { Analysis } from './analysis';
import { explainUndefinedMetric } from './explainUndefinedMetric';
import type { MetricResult, UndefinableMetric, UndefinedReason } from './evaTypes';
import { formatCurrency, formatPercent, formatRatio, ratioAtDisplayPrecision } from './formatting';
import type { MetricKey } from './metricDefinitions';

/**
 * Whether a result is favorable. `neutral` is used for exact-target results and for measures that
 * describe a situation rather than performance. `undefined` means the metric is `N/A`.
 */
export type Tone = 'favorable' | 'unfavorable' | 'neutral' | 'undefined';

export interface Interpretation {
  tone: Tone;
  text: string;
}

// Interpretations compare full-precision values with 0 or 1 (`EVA_FORMULAS.md` §7). No tolerance
// is applied: equal inputs produce exactly 0 and exactly 1 in floating point. CPI and SPI are
// compared with 1 at their displayed precision (four decimal places), so a value shown as
// `1.0000` is never called favorable or unfavorable. The calculated value itself is unchanged.

/** Compares a ratio with 1 as it is displayed: -1 below, 0 equal, 1 above. */
function compareDisplayedRatioWithOne(value: number): -1 | 0 | 1 {
  const shown = ratioAtDisplayPrecision(value);
  return shown > 1 ? 1 : shown < 1 ? -1 : 0;
}

function undefinedText(metric: UndefinableMetric, reason: UndefinedReason): Interpretation {
  return { tone: 'undefined', text: explainUndefinedMetric(metric, reason) };
}

function interpretCv(cv: number, analysis: Analysis): Interpretation {
  const amount = formatCurrency(Math.abs(cv), analysis.currency);
  if (cv > 0) {
    return {
      tone: 'favorable',
      text: `Under budget for the work performed: the completed work cost ${amount} less than its budgeted value.`,
    };
  }
  if (cv < 0) {
    return {
      tone: 'unfavorable',
      text: `Over budget for the work performed: the completed work cost ${amount} more than its budgeted value.`,
    };
  }
  return {
    tone: 'neutral',
    text: 'Actual cost equals earned value: the completed work cost exactly its budgeted value.',
  };
}

function interpretSv(sv: number, analysis: Analysis): Interpretation {
  const amount = formatCurrency(Math.abs(sv), analysis.currency);
  if (sv > 0) {
    return {
      tone: 'favorable',
      text: `More work value has been earned than planned by the reporting date, by ${amount}. This is a value, not a number of days.`,
    };
  }
  if (sv < 0) {
    return {
      tone: 'unfavorable',
      text: `Less work value has been earned than planned by the reporting date, by ${amount}. This is a value, not a number of days.`,
    };
  }
  return { tone: 'neutral', text: 'Work is progressing exactly to plan in value terms.' };
}

function interpretCpi(result: MetricResult): Interpretation {
  if (result.status === 'undefined') return undefinedText('cpi', result.reason);
  const cpi = formatRatio(result);
  const comparison = compareDisplayedRatioWithOne(result.value);
  if (comparison > 0) {
    return {
      tone: 'favorable',
      text: `Favorable cost efficiency: each unit of actual cost has earned ${cpi} units of budgeted value.`,
    };
  }
  if (comparison < 0) {
    return {
      tone: 'unfavorable',
      text: `Unfavorable cost efficiency: each unit of actual cost has earned only ${cpi} units of budgeted value.`,
    };
  }
  if (result.value !== 1) {
    return {
      tone: 'neutral',
      text: `Cost efficiency is ${cpi} at four decimal places: earned value and actual cost are effectively equal.`,
    };
  }
  return {
    tone: 'neutral',
    text: 'Cost efficiency matches earned value: earned value equals actual cost.',
  };
}

function interpretSpi(result: MetricResult): Interpretation {
  if (result.status === 'undefined') return undefinedText('spi', result.reason);
  const spi = formatRatio(result);
  const comparison = compareDisplayedRatioWithOne(result.value);
  if (comparison > 0) {
    return {
      tone: 'favorable',
      text: `Ahead of schedule in earned-value terms: work is being completed at ${spi} times the planned rate.`,
    };
  }
  if (comparison < 0) {
    return {
      tone: 'unfavorable',
      text: `Behind schedule in earned-value terms: work is being completed at ${spi} times the planned rate.`,
    };
  }
  if (result.value !== 1) {
    return {
      tone: 'neutral',
      text: `Schedule performance is ${spi} at four decimal places: earned value and planned value are effectively equal.`,
    };
  }
  return {
    tone: 'neutral',
    text: 'Progress matches the plan in earned-value terms: earned value equals planned value.',
  };
}

function interpretEac(analysis: Analysis): Interpretation {
  const result = analysis.metrics.eac;
  if (result.status === 'undefined') return undefinedText('eac', result.reason);
  const { bac } = analysis.inputs;
  const eac = formatCurrency(result, analysis.currency);
  const difference = formatCurrency(Math.abs(result.value - bac), analysis.currency);
  const budget = formatCurrency(bac, analysis.currency);
  if (result.value > bac) {
    return {
      tone: 'unfavorable',
      text: `If current cost efficiency continues, the project is forecast to cost ${eac}, ${difference} above the approved budget of ${budget}.`,
    };
  }
  if (result.value < bac) {
    return {
      tone: 'favorable',
      text: `If current cost efficiency continues, the project is forecast to cost ${eac}, ${difference} below the approved budget of ${budget}.`,
    };
  }
  return {
    tone: 'neutral',
    text: `If current cost efficiency continues, the project is forecast to cost ${eac}, equal to the approved budget.`,
  };
}

function interpretEtc(analysis: Analysis): Interpretation {
  const result = analysis.metrics.etc;
  if (result.status === 'undefined') return undefinedText('etc', result.reason);
  if (result.value < 0) {
    // Not reachable for validated inputs (`EVA_FORMULAS.md` §3); kept visible rather than clamped.
    return {
      tone: 'neutral',
      text: 'The calculated ETC is negative, which is not a valid outcome for validated inputs. Check the inputs.',
    };
  }
  if (result.value === 0) {
    return {
      tone: 'neutral',
      text: 'No remaining cost is forecast: all budgeted work value has been earned.',
    };
  }
  return {
    tone: 'neutral',
    text: `If current cost efficiency continues, the remaining work is forecast to cost ${formatCurrency(result, analysis.currency)}.`,
  };
}

function interpretVac(analysis: Analysis): Interpretation {
  const result = analysis.metrics.vac;
  if (result.status === 'undefined') return undefinedText('vac', result.reason);
  const amount = formatCurrency(Math.abs(result.value), analysis.currency);
  if (result.value > 0) {
    return {
      tone: 'favorable',
      text: `Forecast to finish ${amount} below the approved budget, if current cost efficiency continues.`,
    };
  }
  if (result.value < 0) {
    return {
      tone: 'unfavorable',
      text: `Forecast to finish ${amount} above the approved budget, if current cost efficiency continues.`,
    };
  }
  return {
    tone: 'neutral',
    text: 'Forecast to finish exactly on the approved budget, if current cost efficiency continues.',
  };
}

function interpretTcpi(metric: 'tcpiBac' | 'tcpiEac', analysis: Analysis): Interpretation {
  const result = analysis.metrics[metric];
  if (result.status === 'undefined') return undefinedText(metric, result.reason);
  const target = metric === 'tcpiBac' ? 'within the approved budget (BAC)' : 'at the forecast EAC';
  if (result.value < 0) {
    return {
      tone: 'neutral',
      text: 'Spending already exceeds the approved budget (AC is above BAC), so the remaining work cannot be completed within BAC. A negative TCPI has no efficiency meaning.',
    };
  }
  if (result.value === 0) {
    return {
      tone: 'neutral',
      text: 'No work remains (EV equals BAC), so no further cost efficiency is required.',
    };
  }
  const value = formatRatio(result);
  return {
    tone: 'neutral',
    text: `To finish ${target}, the remaining work must earn ${value} units of budgeted value for each unit of cost. This states the required efficiency, not whether it is achievable.`,
  };
}

function interpretPercent(
  metric: 'plannedCompletion' | 'earnedCompletion' | 'budgetUtilization',
  result: MetricResult,
): Interpretation {
  if (result.status === 'undefined') return undefinedText(metric, result.reason);
  const value = formatPercent(result);
  if (metric === 'plannedCompletion') {
    return {
      tone: 'neutral',
      text: `${value} of the total budgeted work value was scheduled to be complete by the reporting date.`,
    };
  }
  if (metric === 'earnedCompletion') {
    return {
      tone: 'neutral',
      text: `${value} of the total budgeted work value has been earned by the reporting date.`,
    };
  }
  return {
    tone: 'neutral',
    text:
      result.value > 100
        ? `${value} of the total approved budget has been spent: spending already exceeds the budget.`
        : `${value} of the total approved budget has been spent.`,
  };
}

/** Deterministic interpretation of one EVA metric, based only on the calculated values. */
export function interpretMetric(metric: MetricKey, analysis: Analysis): Interpretation {
  const { metrics } = analysis;
  switch (metric) {
    case 'cv':
      return interpretCv(metrics.cv, analysis);
    case 'sv':
      return interpretSv(metrics.sv, analysis);
    case 'cpi':
      return interpretCpi(metrics.cpi);
    case 'spi':
      return interpretSpi(metrics.spi);
    case 'eac':
      return interpretEac(analysis);
    case 'etc':
      return interpretEtc(analysis);
    case 'vac':
      return interpretVac(analysis);
    case 'tcpiBac':
    case 'tcpiEac':
      return interpretTcpi(metric, analysis);
    case 'plannedCompletion':
    case 'earnedCompletion':
    case 'budgetUtilization':
      return interpretPercent(metric, metrics[metric]);
  }
}

/**
 * Budget variance describes budget remaining or spending above the budget. It is always neutral:
 * it is not a measure of cost efficiency (`EVA_FORMULAS.md` §10.4).
 */
export function interpretBudgetVariance(analysis: Analysis): Interpretation {
  const { budgetVariance, budgetVariancePercent } = analysis.budget;
  const amount = formatCurrency(Math.abs(budgetVariance), analysis.currency);
  const percent =
    budgetVariancePercent.status === 'defined'
      ? ` (${formatPercent(Math.abs(budgetVariancePercent.value))} of the budget)`
      : '';
  if (budgetVariance > 0) {
    return {
      tone: 'neutral',
      text: `Budget remaining: spending to date is ${amount}${percent} below the total approved budget.`,
    };
  }
  if (budgetVariance < 0) {
    return {
      tone: 'neutral',
      text: `Spending above total budget: spending to date already exceeds the total approved budget by ${amount}${percent}.`,
    };
  }
  return {
    tone: 'neutral',
    text: 'Spending to date equals the total approved budget; no budget remains.',
  };
}

export interface HeadlineStatus {
  /** Short status, e.g. `Favorable` or `Not assessable`. */
  label: string;
  tone: Tone;
  text: string;
}

export interface PerformanceSummary {
  cost: HeadlineStatus;
  schedule: HeadlineStatus;
  forecast: string;
  budget: string;
}

function headline(index: Interpretation, fallbackDetail: Interpretation): HeadlineStatus {
  if (index.tone === 'undefined') {
    return {
      label: 'Not assessable',
      tone: 'undefined',
      text: `${index.text} ${fallbackDetail.text}`,
    };
  }
  const label =
    index.tone === 'favorable'
      ? 'Favorable'
      : index.tone === 'unfavorable'
        ? 'Unfavorable'
        : 'On plan';
  return { label, tone: index.tone, text: index.text };
}

/**
 * Executive summary rules (`UI_WORKFLOW.md` §4): cost from CPI and schedule from SPI when defined;
 * otherwise `Not assessable`, with CV or SV explained separately and never used as the headline.
 */
export function summarizePerformance(analysis: Analysis): PerformanceSummary {
  const cv = interpretMetric('cv', analysis);
  const sv = interpretMetric('sv', analysis);
  return {
    cost: headline(interpretMetric('cpi', analysis), {
      tone: cv.tone,
      text: `Cost Variance (CV): ${cv.text}`,
    }),
    schedule: headline(interpretMetric('spi', analysis), {
      tone: sv.tone,
      text: `Schedule Variance (SV): ${sv.text}`,
    }),
    forecast: interpretMetric('eac', analysis).text,
    budget: interpretBudgetVariance(analysis).text,
  };
}
