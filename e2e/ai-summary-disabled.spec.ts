/**
 * The default build (`VITE_AI_SUMMARY_ENABLED` not set): no AI section, no AI action, and no AI
 * request. Feature-on behavior is in `ai-summary-enabled.spec.ts`.
 */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openProjectDetails } from './landing';

test('the default build offers no AI summary and sends no AI request', async ({ page }) => {
  const apiRequests: string[] = [];
  await page.route('**/api/**', (route) => {
    apiRequests.push(route.request().url());
    return route.abort();
  });

  await openProjectDetails(page);
  await page.getByLabel('Project name').fill('Default build project');
  await page.getByLabel(/Reporting date/).fill('2026-03-31');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await page.getByLabel('Currency for all amounts').selectOption('USD');
  await page.getByLabel(/Budget at Completion/).fill('100,000');
  await page.getByLabel(/Planned Value/).fill('40000');
  await page.getByLabel(/Earned Value/).fill('35000');
  await page.getByLabel(/Actual Cost/).fill('42000');
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the analysis');

  await expect(page.getByRole('region', { name: 'AI-generated summary' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /AI summary/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2 }).last()).toHaveText(
    'Assumptions and limitations',
  );

  // The CSV report has no AI rows.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report (CSV)' }).click();
  const csv = (await readFile(await (await downloadPromise).path())).toString('utf8');
  expect(csv).toContain('Budget versus actual,Budget variance,,58000,');
  expect(csv).not.toContain('AI-generated');

  await page.waitForTimeout(300);
  expect(apiRequests).toEqual([]);
});
