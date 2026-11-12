import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openProjectDetails } from './landing';

interface Values {
  bac: string;
  pv: string;
  ev: string;
  ac: string;
}

const FIXTURE: Values = { bac: '100,000', pv: '40000', ev: '35000', ac: '42000' };

async function calculate(page: Page, values: Values = FIXTURE) {
  await openProjectDetails(page);
  await page.getByLabel('Project name').fill('=Billing, "core" release');
  await page.getByLabel(/Description/).fill('Line one,\nline "two"');
  await page.getByLabel(/Project manager/).fill('-A. Rahman');
  await page.getByLabel(/Reporting date/).fill('2026-03-31');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await page.getByLabel('Currency for all amounts').selectOption('USD');
  await page.getByLabel(/Budget at Completion/).fill(values.bac);
  await page.getByLabel(/Planned Value/).fill(values.pv);
  await page.getByLabel(/Earned Value/).fill(values.ev);
  await page.getByLabel(/Actual Cost/).fill(values.ac);
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the analysis');
}

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations,
    results.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
}

async function expectNoInvalidNumbers(page: Page) {
  await expect(page.locator('main')).not.toContainText(/NaN|Infinity/);
}

test('shows the full report with the budget comparison and three charts', async ({ page }) => {
  await calculate(page);

  const budget = page.getByRole('region', { name: 'Budget versus actual' });
  await expect(budget).toContainText('$58,000.00');
  await expect(budget).toContainText('58.0%');
  await expect(budget).toContainText('not Cost Variance (CV = EV − AC)');

  const charts = page.getByRole('region', { name: 'Visual analysis' });
  await expect(charts.getByRole('figure')).toHaveCount(3);
  await expect(charts.getByRole('figure', { name: 'Cost and schedule performance' })).toContainText(
    'Unfavorable cost efficiency (below 1.00)',
  );
  await expect(
    charts.getByRole('figure', { name: 'Budget, actual cost, and forecast' }),
  ).toContainText('$120,000.00');

  await expectNoInvalidNumbers(page);
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

test('keeps BAC and AC plotted and marks undefined metrics N/A', async ({ page }) => {
  await calculate(page, { bac: '1000', pv: '0', ev: '0', ac: '0' });

  const forecast = page.getByRole('figure', { name: 'Budget, actual cost, and forecast' });
  await expect(forecast).toContainText('EAC cannot be calculated');
  await expect(forecast.locator('[data-bar]')).toHaveCount(2);
  await expect(
    page.getByRole('figure', { name: 'Cost and schedule performance' }).locator('[data-bar]'),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Performance at a glance' })).toContainText(
    'Not assessable',
  );

  await expectNoInvalidNumbers(page);
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

test('downloads an RFC 4180 UTF-8 CSV report with formula protection', async ({ page }) => {
  await calculate(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report (CSV)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('eva-report-billing-core-release-2026-03-31.csv');
  await expect(page.getByRole('status').filter({ hasText: 'Report downloaded as' })).toBeVisible();

  const path = await download.path();
  const bytes = await readFile(path);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = bytes.subarray(3).toString('utf8');

  expect(
    csv.startsWith(
      'Section,Item,Symbol,Value,Display value,Unit,Formula or definition,Interpretation\r\n',
    ),
  ).toBe(true);
  expect(csv.endsWith('\r\n')).toBe(true);
  expect(csv).toContain(`Project,Project name,,"'=Billing, ""core"" release",`);
  expect(csv).toContain('Project,Description,,"Line one,\nline ""two""",');
  expect(csv).toContain("Project,Project manager,,'-A. Rahman,");
  expect(csv).toContain('Project,Reporting date,,2026-03-31,"March 31, 2026",');
  expect(csv).toContain(`Cost performance,Cost Variance,CV,-7000,"'-$7,000.00",USD,`);
  expect(csv).toContain(`Budget versus actual,Budget variance,,58000,"$58,000.00",USD,`);
  expect(csv).toContain('Budget versus actual,Percentage variance,,58,58.0%,% of BAC,');
  expect(csv).toContain('EAC assumes the current cost efficiency (CPI) continues');
  expect(csv).not.toMatch(/NaN|Infinity/);
});

test('shows the confirmed analysis after inputs change until recalculated', async ({ page }) => {
  await calculate(page);

  await page.getByRole('button', { name: 'Edit inputs' }).click();
  await page.getByLabel(/Actual Cost/).fill('99,999');
  await page.getByRole('button', { name: 'View last analysis' }).click();

  await expect(page.getByText('This report uses the previously confirmed inputs')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Confirmed EVA inputs' })).toContainText(
    '$42,000.00',
  );
  await expect(page.locator('main')).not.toContainText('99,999');
  await expectNoAxeViolations(page);

  await page.getByRole('button', { name: 'Review inputs and recalculate' }).click();
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
  await expect(page.getByText('This report uses the previously confirmed inputs')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Confirmed EVA inputs' })).toContainText(
    '$99,999.00',
  );

  // The analysis is recalculated from the confirmed inputs after a reload.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Budget versus actual' })).toContainText('$1.00');
});
