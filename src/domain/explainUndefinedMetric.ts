import type { UndefinableMetric, UndefinedReason } from './evaTypes';

const METRIC_LABELS: Record<UndefinableMetric, string> = {
  cpi: 'CPI',
  spi: 'SPI',
  eac: 'EAC',
  etc: 'ETC',
  vac: 'VAC',
  tcpiBac: 'TCPI against BAC',
  tcpiEac: 'TCPI against EAC',
  plannedCompletion: 'Planned completion',
  earnedCompletion: 'Earned completion',
  budgetUtilization: 'Budget utilization',
};

const REASON_TEXT: Record<UndefinedReason, string> = {
  actualCostZero: 'Actual Cost (AC) is zero, so CPI = EV / AC would divide by zero.',
  earnedValueZero:
    'Earned Value (EV) is zero, so CPI is zero and the forecast EAC = BAC / CPI would divide by zero.',
  plannedValueZero: 'Planned Value (PV) is zero, so SPI = EV / PV would divide by zero.',
  budgetEqualsActualCost:
    'Actual Cost (AC) equals BAC, so no budget remains and (BAC − EV) / (BAC − AC) would divide by zero.',
  workComplete:
    'Earned Value (EV) equals BAC, so no work remains and (BAC − EV) / (EAC − AC) would divide by zero.',
  budgetZero: 'BAC is zero, so ratios against BAC would divide by zero.',
  notFinite: 'The result is too large to represent reliably with the supplied values.',
};

// Metrics derived from the CPI-based forecast, and the reasons that come from CPI itself.
const EAC_DEPENDENTS = new Set<UndefinableMetric>(['eac', 'etc', 'vac', 'tcpiEac']);
const CPI_REASONS = new Set<UndefinedReason>(['actualCostZero', 'earnedValueZero']);

/**
 * Explains why `metric` is unavailable, using the root-cause reason produced by
 * `calculateEvaMetrics`. Presentation code should display this text next to `N/A`.
 */
export function explainUndefinedMetric(metric: UndefinableMetric, reason: UndefinedReason): string {
  const label = METRIC_LABELS[metric];

  if (EAC_DEPENDENTS.has(metric) && CPI_REASONS.has(reason)) {
    const dependency =
      metric === 'eac'
        ? 'EAC requires a defined, non-zero CPI.'
        : `${label} depends on EAC, which requires a defined, non-zero CPI.`;

    return `${label} cannot be calculated. ${dependency} ${REASON_TEXT[reason]}`;
  }

  return `${label} cannot be calculated. ${REASON_TEXT[reason]}`;
}
