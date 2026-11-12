import type { ReactNode } from 'react';
import { useId } from 'react';
import type { ChartScale } from './chartScale';
import { toPercent } from './chartScale';
import styles from './BarChart.module.css';

export type BarVariant = 'planned' | 'earned' | 'actual' | 'budget' | 'forecast' | 'index';

export interface BarRow {
  key: string;
  symbol: string;
  name: string;
  /** The plotted value, or `null` when the metric is undefined. Never replaced by zero. */
  value: number | null;
  /** Formatted value, or `N/A`. */
  display: string;
  variant: BarVariant;
  /** Text shown under the row: a status, or the reason a value is N/A. */
  note?: ReactNode;
}

export interface ReferenceLine {
  value: number;
  label: string;
}

interface BarChartProps {
  title: string;
  description: ReactNode;
  axisLabel: string;
  scale: ChartScale;
  formatTick: (value: number) => string;
  rows: readonly BarRow[];
  reference?: ReferenceLine;
}

/**
 * A horizontal bar chart built from HTML and CSS. Labels and values are real text, so the chart
 * reads as a list to assistive technology and stays legible at any width. Bars are decorative.
 */
export function BarChart({
  title,
  description,
  axisLabel,
  scale,
  formatTick,
  rows,
  reference,
}: BarChartProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const referencePosition = reference ? toPercent(reference.value, scale) : null;

  return (
    <figure className={styles.chart} aria-labelledby={titleId} aria-describedby={descriptionId}>
      <figcaption className={styles.caption}>
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      </figcaption>

      <div className={styles.plot}>
        <ul className={styles.rows}>
          {rows.map((row) => {
            // Plotted values are never negative for validated inputs; they are not clamped here.
            const width = row.value === null ? 0 : toPercent(row.value, scale);
            return (
              <li key={row.key} className={styles.row} data-variant={row.variant}>
                <span className={styles.label}>
                  <abbr className={styles.symbol} title={row.name}>
                    {row.symbol}
                  </abbr>{' '}
                  <span className={styles.name}>{row.name}</span>
                </span>
                <span className={`${styles.value} numeric`}>
                  <span className="visually-hidden">: </span>
                  {row.display}
                </span>
                <span className={styles.track} aria-hidden="true">
                  {row.value === null ? (
                    <span data-not-plotted="" className={styles.notPlotted}>
                      Not plotted
                    </span>
                  ) : (
                    <span
                      data-bar=""
                      className={styles.bar}
                      data-variant={row.variant}
                      data-zero={row.value === 0 ? '' : undefined}
                      style={{ width: `${width}%` }}
                    />
                  )}
                  {referencePosition !== null ? (
                    <span
                      data-reference=""
                      className={styles.reference}
                      style={{ left: `${referencePosition}%` }}
                    />
                  ) : null}
                </span>
                {row.note ? <span className={styles.note}>{row.note}</span> : null}
              </li>
            );
          })}
        </ul>

        <div className={styles.axis} aria-hidden="true">
          <div className={styles.ticks}>
            {scale.ticks.map((tick, index) => (
              <span
                key={tick}
                className={styles.tick}
                data-edge={
                  index === 0 ? 'start' : index === scale.ticks.length - 1 ? 'end' : undefined
                }
                style={{ left: `${toPercent(tick, scale)}%` }}
              >
                {formatTick(tick)}
              </span>
            ))}
          </div>
          <p className={styles.axisLabel}>{axisLabel}</p>
          {reference ? (
            <p className={styles.legend}>
              <span className={styles.legendLine} />
              Dashed line: {reference.label}
            </p>
          ) : null}
        </div>
      </div>
    </figure>
  );
}
