import type { EvaInputs, EvaMetrics, MetricResult, UndefinedReason } from './evaTypes';

export function defined(value: number): MetricResult {
  return { status: 'defined', value };
}

export function undefinedMetric(reason: UndefinedReason): MetricResult {
  return { status: 'undefined', reason };
}

/**
 * Divides, returning an undefined result with `zeroReason` for a zero denominator and
 * `notFinite` for an overflowing quotient. Never returns NaN or Infinity.
 */
export function divide(
  numerator: number,
  denominator: number,
  zeroReason: UndefinedReason,
): MetricResult {
  if (denominator === 0) {
    return undefinedMetric(zeroReason);
  }

  const result = numerator / denominator;

  return Number.isFinite(result) ? defined(result) : undefinedMetric('notFinite');
}

/** Applies `fn` to a defined result; an undefined result passes through with its reason. */
function mapDefined(result: MetricResult, fn: (value: number) => MetricResult): MetricResult {
  return result.status === 'defined' ? fn(result.value) : result;
}

function percentOf(value: number, bac: number): MetricResult {
  return mapDefined(divide(value, bac, 'budgetZero'), (ratio) => defined(ratio * 100));
}

/**
 * Calculates every EVA metric from `docs/EVA_FORMULAS.md` at full precision.
 * Values are never clamped or rounded. Dependent metrics inherit the undefined status, and the
 * root-cause reason, of the metrics they are defined from.
 */
export function calculateEvaMetrics({ bac, pv, ev, ac }: EvaInputs): EvaMetrics {
  const cpi = divide(ev, ac, 'actualCostZero');
  const spi = divide(ev, pv, 'plannedValueZero');

  // EAC = BAC / CPI, assuming current cost efficiency continues. It is undefined whenever CPI is
  // undefined, and when CPI = 0. Once CPI is defined and non-zero, AC > 0 and EV > 0 hold, so the
  // algebraically equal BAC × AC / EV is used to avoid compounding CPI's rounding error.
  const eac = mapDefined(cpi, (cpiValue) =>
    cpiValue === 0 ? undefinedMetric('earnedValueZero') : divide(bac * ac, ev, 'earnedValueZero'),
  );

  // ETC = EAC − AC, defined only when EAC is. With EAC's preconditions (AC > 0, EV > 0) it equals
  // AC × (BAC − EV) / EV, which is exactly zero when EV = BAC; subtracting EAC − AC directly could
  // leave a floating-point remainder and make TCPI_EAC appear defined.
  const etc = mapDefined(eac, () => divide(ac * (bac - ev), ev, 'earnedValueZero'));

  const vac = mapDefined(eac, (eacValue) => defined(bac - eacValue));

  // TCPI_EAC = (BAC − EV) / (EAC − AC), whose denominator is ETC.
  const tcpiEac = mapDefined(etc, (etcValue) => divide(bac - ev, etcValue, 'workComplete'));

  return {
    cv: ev - ac,
    sv: ev - pv,
    cpi,
    spi,
    eac,
    etc,
    vac,
    tcpiBac: divide(bac - ev, bac - ac, 'budgetEqualsActualCost'),
    tcpiEac,
    plannedCompletion: percentOf(pv, bac),
    earnedCompletion: percentOf(ev, bac),
    budgetUtilization: percentOf(ac, bac),
  };
}
