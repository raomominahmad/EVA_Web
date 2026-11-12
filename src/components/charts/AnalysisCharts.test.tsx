import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createAnalysis } from '@/domain/analysis';
import type { EvaInputs } from '@/domain/evaTypes';
import { BudgetComparisonChart, ForecastChart, PerformanceIndexChart } from './AnalysisCharts';
import { niceScale, toPercent } from './chartScale';

const FIXTURE: EvaInputs = { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 };

function analysis(inputs: Partial<EvaInputs> = {}) {
  return createAnalysis('USD', { ...FIXTURE, ...inputs });
}

function rowOf(figure: HTMLElement, symbol: string) {
  const row = within(figure)
    .getAllByRole('listitem')
    .find((item) => item.querySelector('abbr')?.textContent === symbol);
  if (!row) throw new Error(`No row for ${symbol}`);
  return row;
}

function barWidth(row: HTMLElement) {
  const bar = row.querySelector<HTMLElement>('[data-bar]');
  return bar ? Number.parseFloat(bar.style.width) : null;
}

describe('niceScale', () => {
  it('starts at zero, covers the largest value, and uses round steps', () => {
    expect(niceScale(100_000)).toEqual({
      max: 100_000,
      ticks: [0, 25_000, 50_000, 75_000, 100_000],
    });
    expect(niceScale(1.2)).toEqual({ max: 1.5, ticks: [0, 0.5, 1, 1.5] });
    expect(niceScale(120_000).max).toBeGreaterThanOrEqual(120_000);
    expect(niceScale(9_007_199_254_740_991).max).toBeGreaterThanOrEqual(9_007_199_254_740_991);
  });

  it('returns a usable scale for a zero maximum', () => {
    expect(niceScale(0).max).toBe(1);
  });
});

describe('BudgetComparisonChart', () => {
  it('plots PV, EV, AC, and BAC from the shared analysis on one scale', () => {
    render(<BudgetComparisonChart analysis={analysis()} />);
    const figure = screen.getByRole('figure', { name: 'Budget and earned value' });
    expect(figure).toHaveAccessibleDescription(/one USD scale starting at zero/);

    expect(rowOf(figure, 'PV')).toHaveTextContent('PV Planned Value: $40,000.00');
    expect(rowOf(figure, 'EV')).toHaveTextContent('$35,000.00');
    expect(rowOf(figure, 'AC')).toHaveTextContent('$42,000.00');
    expect(rowOf(figure, 'BAC')).toHaveTextContent('$100,000.00');
    expect(barWidth(rowOf(figure, 'PV'))).toBe(40);
    expect(barWidth(rowOf(figure, 'EV'))).toBe(35);
    expect(barWidth(rowOf(figure, 'AC'))).toBe(42);
    expect(barWidth(rowOf(figure, 'BAC'))).toBe(100);
    expect(within(figure).getByText('Amount (USD)')).toBeInTheDocument();
  });

  it('extends the scale when AC exceeds BAC instead of clipping the bar', () => {
    render(<BudgetComparisonChart analysis={analysis({ ac: 150_000 })} />);
    const figure = screen.getByRole('figure');
    expect(barWidth(rowOf(figure, 'AC'))).toBe(100);
    expect(barWidth(rowOf(figure, 'BAC'))).toBeCloseTo((100_000 / 150_000) * 100);
  });

  it('draws a true zero as a zero mark, not as missing', () => {
    render(<BudgetComparisonChart analysis={analysis({ pv: 0, ac: 0 })} />);
    const pv = rowOf(screen.getByRole('figure'), 'PV');
    expect(pv).toHaveTextContent('$0.00');
    expect(pv.querySelector('[data-bar]')).toHaveAttribute('data-zero');
  });
});

describe('PerformanceIndexChart', () => {
  it('compares CPI and SPI with a 1.00 benchmark and states each status in text', () => {
    render(<PerformanceIndexChart analysis={analysis()} />);
    const figure = screen.getByRole('figure', { name: 'Cost and schedule performance' });
    const cpi = rowOf(figure, 'CPI');
    const spi = rowOf(figure, 'SPI');

    expect(cpi).toHaveTextContent('0.8333');
    expect(cpi).toHaveTextContent('Unfavorable cost efficiency (below 1.00)');
    expect(spi).toHaveTextContent('0.8750');
    expect(spi).toHaveTextContent('Behind schedule in earned-value terms (below 1.00)');

    const scale = niceScale(1.2);
    const reference = cpi.querySelector<HTMLElement>('[data-reference]');
    expect(Number.parseFloat(reference?.style.left ?? '')).toBeCloseTo(toPercent(1, scale));
    expect(within(figure).getByText('Dashed line: 1.00 benchmark')).toBeInTheDocument();
  });

  it('describes favorable and exactly-on-benchmark results', () => {
    render(<PerformanceIndexChart analysis={analysis({ ev: 42_000, pv: 30_000 })} />);
    const figure = screen.getByRole('figure');
    expect(rowOf(figure, 'CPI')).toHaveTextContent(
      'Cost efficiency matches earned value (exactly 1.00)',
    );
    expect(rowOf(figure, 'SPI')).toHaveTextContent(
      'Ahead of schedule in earned-value terms (above 1.00)',
    );
  });

  it('shows undefined indices as N/A with the reason and never draws them', () => {
    render(<PerformanceIndexChart analysis={analysis({ ac: 0, pv: 0 })} />);
    const figure = screen.getByRole('figure');
    for (const symbol of ['CPI', 'SPI']) {
      const row = rowOf(figure, symbol);
      expect(row).toHaveTextContent(': N/A');
      expect(row.querySelector('[data-bar]')).toBeNull();
      expect(row.querySelector('[data-not-plotted]')).not.toBeNull();
    }
    expect(rowOf(figure, 'CPI')).toHaveTextContent('Actual Cost (AC) is zero');
    expect(rowOf(figure, 'SPI')).toHaveTextContent('Planned Value (PV) is zero');
  });
});

describe('ForecastChart', () => {
  it('plots BAC, AC, and the EAC forecast', () => {
    render(<ForecastChart analysis={analysis()} />);
    const figure = screen.getByRole('figure', { name: 'Budget, actual cost, and forecast' });
    expect(rowOf(figure, 'EAC')).toHaveTextContent('$120,000.00');
    expect(barWidth(rowOf(figure, 'EAC'))).toBeCloseTo((120_000 / niceScale(120_000).max) * 100);
    expect(figure).toHaveAccessibleDescription(/assumes the current cost efficiency continues/);
  });

  it('keeps BAC and AC when EAC is undefined and marks EAC N/A instead of zero', () => {
    render(<ForecastChart analysis={analysis({ ac: 0 })} />);
    const figure = screen.getByRole('figure');
    const eac = rowOf(figure, 'EAC');
    expect(eac).toHaveTextContent('Estimate at Completion (forecast): N/A');
    expect(eac).toHaveTextContent('EAC cannot be calculated');
    expect(eac).not.toHaveTextContent('$0.00');
    expect(eac.querySelector('[data-bar]')).toBeNull();
    expect(barWidth(rowOf(figure, 'BAC'))).toBe(100);
    expect(rowOf(figure, 'AC').querySelector('[data-bar]')).toHaveAttribute('data-zero');
    expect(figure).toHaveAccessibleDescription(/EAC is N\/A, so it is not drawn/);
  });

  it('never renders NaN or Infinity for boundary inputs', () => {
    for (const inputs of [{ ac: 0, pv: 0, ev: 0 }, { ev: 0 }, { ac: 9_007_199_254_740_991 }]) {
      const { container, unmount } = render(
        <>
          <BudgetComparisonChart analysis={analysis(inputs)} />
          <PerformanceIndexChart analysis={analysis(inputs)} />
          <ForecastChart analysis={analysis(inputs)} />
        </>,
      );
      expect(container.textContent).not.toMatch(/NaN|Infinity/);
      for (const bar of container.querySelectorAll<HTMLElement>('[data-bar]')) {
        expect(bar.style.width).not.toMatch(/NaN|Infinity/);
      }
      unmount();
    }
  });
});
