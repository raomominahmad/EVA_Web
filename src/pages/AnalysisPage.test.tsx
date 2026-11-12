import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv } from '@/features/export/downloadCsv';
import { renderApp } from '@/test/renderApp';

vi.mock('@/features/export/downloadCsv', () => ({ downloadCsv: vi.fn() }));

const downloadMock = vi.mocked(downloadCsv);

beforeEach(() => {
  downloadMock.mockClear();
});

async function fill(user: UserEvent, values: Record<'bac' | 'pv' | 'ev' | 'ac', string>) {
  for (const [label, value] of [
    [/Budget at Completion/, values.bac],
    [/Planned Value/, values.pv],
    [/Earned Value/, values.ev],
    [/Actual Cost/, values.ac],
  ] as const) {
    const input = screen.getByLabelText(label);
    await user.clear(input);
    await user.type(input, value);
  }
}

async function calculate(
  user: UserEvent,
  values = { bac: '100,000', pv: '40000', ev: '35000', ac: '42000' },
) {
  renderApp();
  await user.type(screen.getByLabelText('Project name'), 'Billing platform');
  await user.type(screen.getByLabelText(/Reporting date/), '2026-03-31');
  await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));
  await user.selectOptions(screen.getByLabelText('Currency for all amounts'), 'USD');
  await fill(user, values);
  await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
  await screen.findByRole('heading', { level: 1, name: 'Read the analysis' });
}

function region(name: string) {
  return screen.getByRole('region', { name });
}

describe('Analysis report', () => {
  it('presents every report section in the approved order', async () => {
    await calculate(userEvent.setup());
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Project overview',
      'Performance at a glance',
      'Confirmed EVA inputs',
      'Cost performance',
      'Schedule performance',
      'Forecast',
      'Completion and budget use',
      'Visual analysis',
      'Budget versus actual',
      'Assumptions and limitations',
    ]);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('links every entry of the section bar to a report section', async () => {
    await calculate(userEvent.setup());
    const nav = screen.getByRole('navigation', { name: 'Report sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Summary',
      'Inputs',
      'Cost',
      'Schedule',
      'Forecast',
      'Completion',
      'Charts',
      'Budget',
      'Assumptions',
    ]);
    for (const link of links) {
      const id = link.getAttribute('href')?.slice(1) ?? '';
      const target = document.getElementById(id);
      expect(target?.tagName).toBe('SECTION');
      expect(target).toHaveAttribute('aria-labelledby', `${id}-heading`);
    }
  });

  it('shows each metric with its name, abbreviation, value, formula, and interpretation', async () => {
    await calculate(userEvent.setup());
    const cost = region('Cost performance');
    const cv = within(cost).getByRole('heading', { name: 'CV Cost Variance' }).closest('li');
    expect(cv).toHaveTextContent('-$7,000.00');
    expect(cv).toHaveTextContent('CV = EV − AC');
    expect(cv).toHaveTextContent('Unfavorable');
    expect(cv).toHaveTextContent('Over budget for the work performed');

    const forecast = region('Forecast');
    expect(within(forecast).getByText('$120,000.00')).toBeInTheDocument();
    expect(within(forecast).getByText('EAC = BAC / CPI')).toBeInTheDocument();

    const summary = region('Performance at a glance');
    expect(summary).toHaveTextContent('Cost efficiency Based on CPIUnfavorable');
  });

  it('integrates the budget-versus-actual comparison, distinct from CV and EAC', async () => {
    await calculate(userEvent.setup());
    const budget = region('Budget versus actual');
    const value = (name: string) =>
      within(budget).getByText(name).closest('div')?.querySelector('dd')?.textContent;

    expect(value('Estimated cost')).toBe('$100,000.00');
    expect(value('Actual cost')).toBe('$42,000.00');
    expect(value('Budget variance')).toBe('$58,000.00');
    expect(value('Percentage variance')).toBe('58.0%');
    expect(budget).toHaveTextContent('not Cost Variance (CV = EV − AC)');
    expect(budget).toHaveTextContent(
      'Estimated cost is the approved budget (BAC), not the forecast EAC.',
    );
    expect(within(budget).queryByText('CV')).not.toBeInTheDocument();
  });

  it('renders all three charts from the confirmed analysis', async () => {
    await calculate(userEvent.setup());
    const charts = region('Visual analysis');
    expect(
      within(charts)
        .getAllByRole('figure')
        .map((figure) => figure.getAttribute('aria-labelledby')),
    ).toHaveLength(3);
    expect(
      within(charts).getByRole('figure', { name: 'Budget and earned value' }),
    ).toBeInTheDocument();
    expect(
      within(charts).getByRole('figure', { name: 'Cost and schedule performance' }),
    ).toBeInTheDocument();
    expect(
      within(charts).getByRole('figure', { name: 'Budget, actual cost, and forecast' }),
    ).toBeInTheDocument();
  });

  it('keeps an undefined EAC visible as N/A in the report and chart', async () => {
    await calculate(userEvent.setup(), { bac: '1000', pv: '0', ev: '0', ac: '0' });
    const forecast = region('Forecast');
    expect(within(forecast).getAllByText('N/A').length).toBeGreaterThan(0);
    const chart = screen.getByRole('figure', { name: 'Budget, actual cost, and forecast' });
    expect(chart).toHaveTextContent('Not plotted');
    expect(region('Performance at a glance')).toHaveTextContent('Not assessable');
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('keeps showing the confirmed analysis after the inputs change, until recalculated', async () => {
    const user = userEvent.setup();
    await calculate(user);
    expect(
      screen.queryByText('This report uses the previously confirmed inputs'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit inputs' }));
    const ac = screen.getByLabelText(/Actual Cost/);
    await user.clear(ac);
    await user.type(ac, '99,999');
    await user.click(screen.getByRole('button', { name: 'View last analysis' }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Read the analysis' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This report uses the previously confirmed inputs'),
    ).toBeInTheDocument();
    // No draft value reaches the report.
    expect(within(region('Confirmed EVA inputs')).getByText('$42,000.00')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('99,999');
    expect(region('Budget versus actual')).toHaveTextContent('$58,000.00');

    // The export also uses the confirmed analysis.
    await user.click(screen.getByRole('button', { name: 'Download report (CSV)' }));
    const [csv] = downloadMock.mock.calls[0] ?? [];
    expect(csv).toContain('Actual Cost,AC,42000,');
    expect(csv).not.toContain('99999');

    await user.click(screen.getByRole('button', { name: 'Review inputs and recalculate' }));
    expect(screen.getByLabelText(/Actual Cost/)).toHaveValue('99,999');
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));

    expect(
      screen.queryByText('This report uses the previously confirmed inputs'),
    ).not.toBeInTheDocument();
    expect(within(region('Confirmed EVA inputs')).getByText('$99,999.00')).toBeInTheDocument();
    expect(region('Budget versus actual')).toHaveTextContent('$1.00');
  });

  it('downloads the CSV report and confirms the file name', async () => {
    const user = userEvent.setup();
    await calculate(user);
    await user.click(screen.getByRole('button', { name: 'Download report (CSV)' }));

    expect(downloadMock).toHaveBeenCalledTimes(1);
    const [csv, fileName] = downloadMock.mock.calls[0] ?? [];
    expect(fileName).toBe('eva-report-billing-platform-2026-03-31.csv');
    expect(csv).toContain('Budget versus actual,Budget variance,,58000,');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Report downloaded as eva-report-billing-platform-2026-03-31.csv.',
    );
  });
});
