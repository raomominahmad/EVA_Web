import type { CSSProperties } from 'react';
import { formatCompactAmount, niceScale, toPercent } from '@/components/charts/chartScale';
import { ToneBadge } from '@/components/report/MetricList';
import { SignedNumber } from '@/components/report/SignedNumber';
import { createAnalysis } from '@/domain/analysis';
import type { MetricResult } from '@/domain/evaTypes';
import { formatCurrency, formatRatio } from '@/domain/formatting';
import { interpretMetric, summarizePerformance } from '@/domain/interpretations';
import type { Tone } from '@/domain/interpretations';
import { METRIC_DEFINITIONS } from '@/domain/metricDefinitions';
import styles from './ReportPreview.module.css';

/**
 * Illustrative inputs for the landing page preview: the worked example in `EVA_FORMULAS.md` §8.
 * They are labelled as sample data wherever they appear and are never used by the workflow.
 */
const SAMPLE = { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 } as const;
const SAMPLE_CURRENCY = 'USD';

const definedValue = (result: MetricResult): number | null =>
  result.status === 'defined' ? result.value : null;

interface Tile {
  symbol: string;
  name: string;
  value: string;
  status: { tone: Tone; label?: string } | null;
  note?: string;
}

/**
 * A compact view of the real report, calculated by the same engine, formatting, and
 * interpretation functions from the sample inputs. The chart mirrors the report's "Budget, actual
 * cost, and forecast" chart, on the same scale.
 */
export function ReportPreview() {
  const analysis = createAnalysis(SAMPLE_CURRENCY, { ...SAMPLE });
  const { metrics, budget } = analysis;
  const summary = summarizePerformance(analysis);
  const money = (value: Parameters<typeof formatCurrency>[0]) =>
    formatCurrency(value, SAMPLE_CURRENCY);

  const inputs = [
    { symbol: 'BAC', name: 'Budget at Completion', value: SAMPLE.bac },
    { symbol: 'PV', name: 'Planned Value', value: SAMPLE.pv },
    { symbol: 'EV', name: 'Earned Value', value: SAMPLE.ev },
    { symbol: 'AC', name: 'Actual Cost', value: SAMPLE.ac },
  ] as const;

  const tiles: Tile[] = [
    {
      symbol: 'CPI',
      name: 'Cost Performance Index',
      value: formatRatio(metrics.cpi),
      status: summary.cost,
    },
    {
      symbol: 'SPI',
      name: 'Schedule Performance Index',
      value: formatRatio(metrics.spi),
      status: summary.schedule,
    },
    {
      symbol: 'CV',
      name: 'Cost Variance',
      value: money(metrics.cv),
      status: { tone: interpretMetric('cv', analysis).tone },
    },
    {
      symbol: 'SV',
      name: 'Schedule Variance',
      value: money(metrics.sv),
      status: { tone: interpretMetric('sv', analysis).tone },
    },
    {
      symbol: 'EAC',
      name: 'Estimate at Completion',
      value: money(metrics.eac),
      status: null,
      note: 'If current cost efficiency continues',
    },
    {
      symbol: 'BAC − AC',
      name: 'Budget variance',
      value: money(budget.budgetVariance),
      status: null,
      note: 'Budget remaining, not CV',
    },
  ];

  const eac = definedValue(metrics.eac);
  // An undefined forecast is never drawn as zero; it is simply left out.
  const bars = [
    { symbol: 'BAC', value: SAMPLE.bac, variant: 'budget' },
    { symbol: 'AC', value: SAMPLE.ac, variant: 'actual' },
    ...(eac === null ? [] : [{ symbol: 'EAC', value: eac, variant: 'forecast' }]),
  ] as const;
  const scale = niceScale(Math.max(...bars.map((bar) => bar.value)));
  // The dashed approved-budget line is drawn across every track at BAC's position on the scale.
  const plotStyle = { '--budget-at': `${toPercent(SAMPLE.bac, scale)}%` } as CSSProperties;

  return (
    <figure className={styles.preview} aria-labelledby="preview-title">
      <figcaption className={styles.bar}>
        <span id="preview-title" className={styles.title}>
          Sample report preview
        </span>
        <span className={styles.sample}>Sample data — Illustrative analysis</span>
      </figcaption>

      <div className={styles.body}>
        <dl className={styles.inputs} aria-label="Illustrative inputs">
          {inputs.map(({ symbol, name, value }) => (
            <div key={symbol} className={styles.input}>
              <dt>
                <abbr title={name}>{symbol}</abbr>
              </dt>
              <dd className="numeric">{money(value)}</dd>
            </div>
          ))}
        </dl>

        <dl className={styles.tiles} aria-label="Calculated by EVA">
          {tiles.map(({ symbol, name, value, status, note }) => (
            <div key={symbol} className={styles.tile} data-key={symbol}>
              <dt className={styles.tileLabel}>
                <span className={styles.symbol}>{symbol}</span>
                <span className={styles.tileName}>{name}</span>
              </dt>
              <dd className={`${styles.tileValue} numeric`}>
                <SignedNumber text={value} />
              </dd>
              {status ? (
                <dd className={styles.tileStatus}>
                  <ToneBadge
                    tone={status.tone}
                    {...(status.label ? { label: status.label } : {})}
                  />
                </dd>
              ) : (
                <dd className={styles.tileNote}>{note}</dd>
              )}
            </div>
          ))}
        </dl>

        <div className={styles.chart}>
          <p className={styles.chartTitle}>Budget, actual cost, and forecast</p>
          {/* Every value drawn here is also given as text in the tiles and inputs. */}
          <div className={styles.plot} aria-hidden="true" style={plotStyle}>
            {bars.map((bar, index) => (
              <div key={bar.symbol} className={styles.row}>
                <span className={styles.rowLabel}>{bar.symbol}</span>
                <span className={styles.track}>
                  <span
                    className={styles.fill}
                    data-variant={bar.variant}
                    style={{
                      width: `${toPercent(bar.value, scale)}%`,
                      animationDelay: `${180 + index * 90}ms`,
                    }}
                  />
                </span>
                <span className={`${styles.rowValue} numeric`}>
                  {formatCompactAmount(bar.value)}
                </span>
              </div>
            ))}
            <div className={styles.axis}>
              <span />
              <span className={styles.ticks}>
                {scale.ticks.map((tick) => (
                  <span key={tick} style={{ left: `${toPercent(tick, scale)}%` }}>
                    {formatCompactAmount(tick)}
                  </span>
                ))}
              </span>
              <span />
            </div>
          </div>
          <p className={styles.footnote}>
            <code>{METRIC_DEFINITIONS.eac.formula}</code> assumes the current cost efficiency
            continues. The dashed line marks the approved budget.
          </p>
        </div>
      </div>
    </figure>
  );
}
