export interface ChartScale {
  /** The axis end. Always at least the largest plotted value; the axis always starts at zero. */
  max: number;
  ticks: number[];
}

/**
 * A zero-based linear scale with "nice" tick steps (1, 2, 2.5, or 5 × 10ⁿ). Only positions on the
 * axis are computed here; plotted values come unchanged from the shared analysis result.
 */
export function niceScale(largestValue: number, targetTicks = 4): ChartScale {
  if (!Number.isFinite(largestValue) || largestValue <= 0) {
    return { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }

  const rough = largestValue / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  const count = Math.ceil(largestValue / step - 1e-9);
  // Multiplying each index avoids accumulating floating-point error across steps.
  const ticks = Array.from({ length: count + 1 }, (_, index) =>
    Number((index * step).toPrecision(12)),
  );
  const max = ticks.at(-1) ?? largestValue;

  return { max: Math.max(max, largestValue), ticks };
}

/** Position of `value` along the axis, as a percentage of its length (0–100). */
export function toPercent(value: number, scale: ChartScale): number {
  return scale.max > 0 ? (value / scale.max) * 100 : 0;
}

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Short axis label for amounts, e.g. `25K` or `1.5M`. The axis title states the currency. */
export function formatCompactAmount(value: number): string {
  return compactFormatter.format(value);
}

const indexTickFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatIndexTick(value: number): string {
  return indexTickFormatter.format(value);
}
