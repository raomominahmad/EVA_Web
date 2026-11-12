import type { EvaMetrics } from './evaTypes';

export type MetricKey = keyof EvaMetrics;

/** How a metric's value is measured and formatted. */
export type MetricUnit = 'currency' | 'index' | 'percent';

export interface MetricDefinition {
  /** Standard EVM abbreviation, or `null` for the completion ratios, which have none. */
  symbol: string | null;
  name: string;
  formula: string;
  definition: string;
  unit: MetricUnit;
}

/** Names, formulas, and definitions from `docs/EVA_FORMULAS.md` §2–§4. */
export const METRIC_DEFINITIONS: Record<MetricKey, MetricDefinition> = {
  cv: {
    symbol: 'CV',
    name: 'Cost Variance',
    formula: 'CV = EV − AC',
    definition: 'Budgeted value of the completed work minus what that work actually cost.',
    unit: 'currency',
  },
  sv: {
    symbol: 'SV',
    name: 'Schedule Variance',
    formula: 'SV = EV − PV',
    definition:
      'Value of work completed minus value of work planned by the reporting date, in currency. It is not a number of days.',
    unit: 'currency',
  },
  cpi: {
    symbol: 'CPI',
    name: 'Cost Performance Index',
    formula: 'CPI = EV / AC',
    definition: 'Budgeted value earned for each unit of actual cost.',
    unit: 'index',
  },
  spi: {
    symbol: 'SPI',
    name: 'Schedule Performance Index',
    formula: 'SPI = EV / PV',
    definition:
      'Value of work completed for each unit of work planned, a value-based rate of progress.',
    unit: 'index',
  },
  eac: {
    symbol: 'EAC',
    name: 'Estimate at Completion',
    formula: 'EAC = BAC / CPI',
    definition:
      'Forecast total cost of the project, assuming the current cost efficiency (CPI) continues for the remaining work.',
    unit: 'currency',
  },
  etc: {
    symbol: 'ETC',
    name: 'Estimate to Complete',
    formula: 'ETC = EAC − AC',
    definition: 'Forecast cost of the remaining work, under the same assumption as EAC.',
    unit: 'currency',
  },
  vac: {
    symbol: 'VAC',
    name: 'Variance at Completion',
    formula: 'VAC = BAC − EAC',
    definition: 'Approved budget minus the forecast total cost.',
    unit: 'currency',
  },
  tcpiBac: {
    symbol: 'TCPI (BAC)',
    name: 'To-Complete Performance Index against BAC',
    formula: 'TCPI = (BAC − EV) / (BAC − AC)',
    definition:
      'Cost efficiency required on the remaining work to finish within the original budget.',
    unit: 'index',
  },
  tcpiEac: {
    symbol: 'TCPI (EAC)',
    name: 'To-Complete Performance Index against EAC',
    formula: 'TCPI = (BAC − EV) / (EAC − AC)',
    definition: 'Cost efficiency required on the remaining work to finish at the forecast EAC.',
    unit: 'index',
  },
  plannedCompletion: {
    symbol: null,
    name: 'Planned completion',
    formula: 'PV / BAC × 100',
    definition:
      'Share of the total budgeted work value scheduled to be complete by the reporting date.',
    unit: 'percent',
  },
  earnedCompletion: {
    symbol: null,
    name: 'Earned completion',
    formula: 'EV / BAC × 100',
    definition:
      'Share of the total budgeted work value earned by the reporting date. A value-based ratio, not proof of physical completion.',
    unit: 'percent',
  },
  budgetUtilization: {
    symbol: null,
    name: 'Budget utilization',
    formula: 'AC / BAC × 100',
    definition: 'Share of the total approved budget spent by the reporting date.',
    unit: 'percent',
  },
};

/** Budget-versus-actual items (`docs/EVA_FORMULAS.md` §10). Not EVM metrics; no abbreviations. */
export const BUDGET_DEFINITIONS = {
  estimatedCost: {
    name: 'Estimated cost',
    formula: 'Estimated cost = BAC',
    definition: 'The total approved budget (BAC). Not the forecast EAC.',
  },
  actualCost: {
    name: 'Actual cost',
    formula: 'Actual cost = AC',
    definition: 'Actual cost incurred to the reporting date (AC).',
  },
  budgetVariance: {
    name: 'Budget variance',
    formula: 'Budget variance = BAC − AC',
    definition: 'Total approved budget minus spending to date. Not Cost Variance (CV = EV − AC).',
  },
  budgetVariancePercent: {
    name: 'Percentage variance',
    formula: 'Percentage variance = (BAC − AC) / BAC × 100',
    definition: 'Budget variance as a percentage of the total approved budget.',
  },
} as const;

export const BUDGET_COMPARISON_NOTE =
  'Budget variance compares the total approved budget with spending to date. It ignores how much work has been completed, so it is not Cost Variance (CV = EV − AC) and does not measure cost efficiency; CV and CPI do.';

export const ASSUMPTIONS: readonly string[] = [
  'EAC assumes the current cost efficiency (CPI) continues for all remaining work: EAC = BAC / CPI. If efficiency changes, the actual final cost will differ. ETC, VAC, and TCPI against EAC depend on the same assumption.',
  'Forecasts are estimates, not certainties.',
  'SV and SPI measure progress in value terms. They do not give a number of days ahead of or behind schedule, and they do not account for the critical path.',
  'Completion ratios are value-based and are not proof of physical completion unless the project’s earned-value method supports that.',
  'PV and EV cannot exceed BAC under this application’s baseline assumptions. EV may exceed PV, and AC may exceed BAC.',
  'Undefined ratios, for example when a denominator is zero, are reported as N/A with the reason, never as zero.',
  'The budget-versus-actual comparison does not account for work completed.',
  'Values are calculated at full precision and rounded only for display.',
];
