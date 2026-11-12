export const EVA_INPUT_FIELDS = ['bac', 'pv', 'ev', 'ac'] as const;

export type EvaInputField = (typeof EVA_INPUT_FIELDS)[number];

export interface EvaInputDefinition {
  symbol: string;
  name: string;
  /** Definition from `docs/EVA_FORMULAS.md` §1. */
  definition: string;
}

export const EVA_INPUT_DEFINITIONS: Record<EvaInputField, EvaInputDefinition> = {
  bac: {
    symbol: 'BAC',
    name: 'Budget at Completion',
    definition: 'Total approved budget for the project.',
  },
  pv: {
    symbol: 'PV',
    name: 'Planned Value',
    definition: 'Budgeted value of work scheduled to be completed by the reporting date.',
  },
  ev: {
    symbol: 'EV',
    name: 'Earned Value',
    definition: 'Budgeted value of work actually completed by the reporting date.',
  },
  ac: {
    symbol: 'AC',
    name: 'Actual Cost',
    definition: 'Actual cost incurred for the work completed by the reporting date.',
  },
};

/** Validated monetary inputs, all in one currency. */
export type EvaInputs = Record<EvaInputField, number>;

/** Raw text exactly as the user typed it, before parsing. */
export interface EvaInputDraft extends Record<EvaInputField, string> {
  currency: string;
}

/** Root cause that makes a metric mathematically undefined for the given inputs. */
export type UndefinedReason =
  /** AC = 0, so CPI = EV / AC divides by zero. */
  | 'actualCostZero'
  /** EV = 0 with AC > 0, so CPI = 0 and EAC = BAC / CPI divides by zero. */
  | 'earnedValueZero'
  /** PV = 0, so SPI = EV / PV divides by zero. */
  | 'plannedValueZero'
  /** AC = BAC, so TCPI_BAC = (BAC − EV) / (BAC − AC) divides by zero. */
  | 'budgetEqualsActualCost'
  /** EV = BAC, so EAC − AC = 0 and TCPI_EAC divides by zero. */
  | 'workComplete'
  /** BAC = 0, so ratios against BAC divide by zero. Validation prevents this. */
  | 'budgetZero'
  /** The quotient is too large to represent as a finite number. */
  | 'notFinite';

/** A metric that is either a finite value or explicitly undefined with a reason. */
export type MetricResult =
  { status: 'defined'; value: number } | { status: 'undefined'; reason: UndefinedReason };

/**
 * Calculated metrics. CV and SV are always defined for finite inputs; every other metric can be
 * undefined and then carries the reason, which must be displayed as `N/A` with an explanation.
 */
export interface EvaMetrics {
  cv: number;
  sv: number;
  cpi: MetricResult;
  spi: MetricResult;
  eac: MetricResult;
  etc: MetricResult;
  vac: MetricResult;
  tcpiBac: MetricResult;
  tcpiEac: MetricResult;
  /** Percentage (already multiplied by 100). */
  plannedCompletion: MetricResult;
  /** Percentage (already multiplied by 100). */
  earnedCompletion: MetricResult;
  /** Percentage (already multiplied by 100). */
  budgetUtilization: MetricResult;
}

/** Keys of metrics that can be undefined. */
export type UndefinableMetric = {
  [Key in keyof EvaMetrics]: EvaMetrics[Key] extends MetricResult ? Key : never;
}[keyof EvaMetrics];

export const UNDEFINABLE_METRICS: readonly UndefinableMetric[] = [
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
