import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { buildXlsx } from '../src/test/fixtures/xlsx';
import { openProjectDetails } from './landing';

const CSV = [
  'Currency,BAC,PV,EV,AC,Notes',
  'EUR,"250,000",100000,90000,110000,"Baseline, approved"',
  'EUR,250000,300000,90000,110000,Over plan',
  'EUR,250000,120000,125000,99000,Latest',
].join('\r\n');

async function openInputs(page: Page) {
  await openProjectDetails(page);
  await page.getByLabel('Project name').fill('Billing platform');
  await page.getByLabel(/Project manager/).fill('A. Rahman');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await page.getByRole('button', { name: 'Import from file' }).click();
  return page.getByRole('region', { name: 'Import from file' });
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

test('imports one valid CSV row after explicit confirmation', async ({ page }) => {
  const panel = await openInputs(page);
  await expect(panel.getByRole('heading', { name: 'Import from file' })).toBeFocused();
  await expectNoAxeViolations(page);

  await panel.getByLabel('Choose file').setInputFiles({
    name: 'costs.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });

  const table = panel.getByRole('table', { name: /Rows in costs\.csv/ });
  await expect(table).toBeVisible();
  await expect(panel.getByRole('radio', { name: 'Row 3' })).toBeDisabled();
  await expect(panel.getByText('Ignored columns: Notes')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Use these values' })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);

  // Keyboard selection: arrow keys move between enabled radios only.
  await panel.getByRole('radio', { name: 'Row 2' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('radio', { name: 'Row 4' })).toBeChecked();
  await expect(panel.getByRole('heading', { name: 'Values to import from row 4' })).toBeVisible();
  await expectNoAxeViolations(page);

  await panel.getByRole('button', { name: 'Use these values' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByLabel('Currency for all amounts')).toHaveValue('EUR');
  await expect(page.getByLabel('Currency for all amounts')).toBeFocused();
  await expect(page.getByLabel(/Budget at Completion/)).toHaveValue('250000');
  await expect(page.getByLabel(/Actual Cost/)).toHaveValue('99000');
  await expect(page.getByRole('status').filter({ hasText: 'Imported row 4' })).toBeVisible();

  // Nothing is calculated until the user asks.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enter the four EVA values');
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the analysis');
  await expect(page.getByText('Billing platform').first()).toBeVisible();
});

test('reads an Excel workbook in the import worker', async ({ page }) => {
  const workerUrls: string[] = [];
  page.on('worker', (worker) => workerUrls.push(worker.url()));

  const panel = await openInputs(page);
  const workbook = buildXlsx([
    {
      name: 'March',
      startRow: 2,
      rows: [
        ['Currency', 'BAC', 'PV', 'EV', 'AC'],
        ['USD', 100000, { formula: 'B3*0.4', cached: 40000 }, 35000, { error: '#DIV/0!' }],
        ['USD', 100000, 40000, 35000, 42000.5],
      ],
    },
  ]);

  await panel.getByLabel('Choose file').setInputFiles({
    name: 'march.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(workbook),
  });

  await expect(
    panel.getByRole('table', { name: 'Rows in march.xlsx, worksheet “March”' }),
  ).toBeVisible();
  expect(workerUrls.some((url) => url.includes('import.worker'))).toBe(true);
  await expect(
    panel.getByRole('link', {
      name: 'Row 3, AC: the cell contains the spreadsheet error #DIV/0!.',
    }),
  ).toBeVisible();
  await expect(panel.getByRole('radio', { name: 'Row 4' })).toBeChecked();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);

  await panel.getByRole('button', { name: 'Use these values' }).click();
  await expect(page.getByLabel(/Actual Cost/)).toHaveValue('42000.5');
  await expect(page.getByLabel(/Planned Value/)).toHaveValue('40000');
});

test('shows a focused file error and keeps the form unchanged', async ({ page }) => {
  const panel = await openInputs(page);
  await page.getByLabel(/Budget at Completion/).fill('5000');

  await panel.getByLabel('Choose file').setInputFiles({
    name: 'renamed.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('BAC,PV,EV,AC\n1,1,1,1\n'),
  });

  const alert = panel.getByRole('alert');
  await expect(alert).toContainText('This file cannot be imported');
  await expect(alert).toBeFocused();
  await expectNoAxeViolations(page);

  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Import from file' })).toBeFocused();
  await expect(page.getByLabel(/Budget at Completion/)).toHaveValue('5000');
});
