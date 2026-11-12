import { ArrowDown, ArrowUp, CircleSlash, Equal } from 'lucide-react';
import type { Analysis } from '@/domain/analysis';
import type { MetricResult } from '@/domain/evaTypes';
import { formatCurrency, formatRatio, NOT_AVAILABLE } from '@/domain/formatting';
import { interpretMetric } from '@/domain/interpretations';
import type { Tone } from '@/domain/interpretations';
import { BarChart } from './BarChart';
import type { BarRow } from './BarChart';
import { formatCompactAmount, formatIndexTick, niceScale } from './chartScale';
import styles from './AnalysisCharts.module.css';

interface ChartProps {
  analysis: Analysis;
}

function plotted(result: MetricResult): number | null {
  return result.status === 'defined' ? result.value : null;
}

function StatusNote({ tone, children }: { tone: Tone; children: string }) {
  const Icon =
    tone === 'favorable'
      ? ArrowUp
      : tone === 'unfavorable'
        ? ArrowDown
        : tone === 'undefined'
          ? CircleSlash
          : Equal;
  return (
    <span className={styles.status} data-tone={tone}>
      <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/** Chart 1: PV, EV, AC, and BAC on one zero-based monetary scale. */
export function BudgetComparisonChart({ analysis }: ChartProps) {
  const { inputs, currency } = analysis;
  const money = (value: number) => formatCurrency(value, currency);
  const rows: BarRow[] = [
    {
      key: 'pv',
      symbol: 'PV',
      name: 'Planned Value',
      value: inputs.pv,
      display: money(inputs.pv),
      variant: 'planned',
    },
    {
      key: 'ev',
      symbol: 'EV',
      name: 'Earned Value',
      value: inputs.ev,
      display: money(inputs.ev),
      variant: 'earned',
    },
    {
      key: 'ac',
      symbol: 'AC',
      name: 'Actual Cost',
      value: inputs.ac,
      display: money(inputs.ac),
      variant: 'actual',
    },
    {
      key: 'bac',
      symbol: 'BAC',
      name: 'Budget at Completion',
      value: inputs.bac,
      display: money(inputs.bac),
      variant: 'budget',
    },
  ];

  return (
    <BarChart
      title="Budget and earned value"
      description={`Planned value, earned value, and actual cost to the reporting date, compared with the total approved budget (BAC, hatched bar and dashed line). All four use one ${currency} scale starting at zero.`}
      axisLabel={`Amount (${currency})`}
      scale={niceScale(Math.max(inputs.bac, inputs.pv, inputs.ev, inputs.ac))}
      formatTick={formatCompactAmount}
      rows={rows}
      reference={{
        value: inputs.bac,
        label: `BAC, the total approved budget (${money(inputs.bac)})`,
      }}
    />
  );
}

const INDEX_STATUS: Record<'cpi' | 'spi', Record<Exclude<Tone, 'undefined'>, string>> = {
  cpi: {
    favorable: 'Favorable cost efficiency (above 1.00)',
    unfavorable: 'Unfavorable cost efficiency (below 1.00)',
    neutral: 'Cost efficiency matches earned value (exactly 1.00)',
  },
  spi: {
    favorable: 'Ahead of schedule in earned-value terms (above 1.00)',
    unfavorable: 'Behind schedule in earned-value terms (below 1.00)',
    neutral: 'Matching planned progress (exactly 1.00)',
  },
};

/** Chart 2: CPI and SPI against the 1.00 benchmark. An undefined index is never drawn. */
export function PerformanceIndexChart({ analysis }: ChartProps) {
  const indexRow = (key: 'cpi' | 'spi', name: string): BarRow => {
    const result = analysis.metrics[key];
    const interpretation = interpretMetric(key, analysis);
    return {
      key,
      symbol: key.toUpperCase(),
      name,
      value: plotted(result),
      display: formatRatio(result),
      variant: 'index',
      note: (
        <StatusNote tone={interpretation.tone}>
          {interpretation.tone === 'undefined'
            ? `${NOT_AVAILABLE}: ${interpretation.text}`
            : INDEX_STATUS[key][interpretation.tone]}
        </StatusNote>
      ),
    };
  };
  const rows = [
    indexRow('cpi', 'Cost Performance Index'),
    indexRow('spi', 'Schedule Performance Index'),
  ];
  const largest = Math.max(1.2, ...rows.map((row) => row.value ?? 0));

  return (
    <BarChart
      title="Cost and schedule performance"
      description="CPI and SPI compared with the 1.00 benchmark (dashed line). Above 1.00 is favorable; below 1.00 is unfavorable. An index that cannot be calculated is shown as N/A and is not drawn."
      axisLabel="Index (ratio)"
      scale={niceScale(largest)}
      formatTick={formatIndexTick}
      rows={rows}
      reference={{ value: 1, label: '1.00 benchmark' }}
    />
  );
}

/** Chart 3: BAC, AC, and EAC. BAC and AC are always plotted; an undefined EAC is marked N/A. */
export function ForecastChart({ analysis }: ChartProps) {
  const { inputs, currency, metrics } = analysis;
  const money = (value: number) => formatCurrency(value, currency);
  const eac = interpretMetric('eac', analysis);
  const eacValue = plotted(metrics.eac);
  const rows: BarRow[] = [
    {
      key: 'bac',
      symbol: 'BAC',
      name: 'Budget at Completion',
      value: inputs.bac,
      display: money(inputs.bac),
      variant: 'budget',
    },
    {
      key: 'ac',
      symbol: 'AC',
      name: 'Actual Cost to date',
      value: inputs.ac,
      display: money(inputs.ac),
      variant: 'actual',
    },
    {
      key: 'eac',
      symbol: 'EAC',
      name: 'Estimate at Completion (forecast)',
      value: eacValue,
      display: formatCurrency(metrics.eac, currency),
      variant: 'forecast',
      note:
        eac.tone === 'undefined' ? (
          <StatusNote tone="undefined">{`${NOT_AVAILABLE}: ${eac.text}`}</StatusNote>
        ) : undefined,
    },
  ];

  return (
    <BarChart
      title="Budget, actual cost, and forecast"
      description={
        eacValue === null
          ? `The approved budget (BAC) and actual cost to date (AC). The forecast EAC is N/A, so it is not drawn. One ${currency} scale starting at zero.`
          : `The approved budget (BAC), actual cost to date (AC), and the forecast final cost (EAC, dashed outline), which assumes the current cost efficiency continues. One ${currency} scale starting at zero.`
      }
      axisLabel={`Amount (${currency})`}
      scale={niceScale(Math.max(inputs.bac, inputs.ac, eacValue ?? 0))}
      formatTick={formatCompactAmount}
      rows={rows}
      reference={{
        value: inputs.bac,
        label: `BAC, the total approved budget (${money(inputs.bac)})`,
      }}
    />
  );
}
