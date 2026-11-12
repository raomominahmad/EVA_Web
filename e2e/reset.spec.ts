/**
 * FR-11: "Start a new analysis" on the report, with a native modal confirmation. Runs at desktop
 * (1440×900) and mobile (375×812) widths through the two Playwright projects.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LANDING_TITLE, openProjectDetails } from './landing';

const WORKFLOW_KEY = 'eva.workflow.v1';

async function openAnalysis(page: Page) {
  await openProjectDetails(page);
  await page.getByLabel('Project name').fill('Billing platform, "core" release');
  await page.getByLabel(/Description/).fill('Private description');
  await page.getByLabel(/Project manager/).fill('A. Rahman');
  await page.getByLabel(/Reporting date/).fill('2026-03-31');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await page.getByLabel('Currency for all amounts').selectOption('USD');
  await page.getByLabel(/Budget at Completion/).fill('100,000');
  await page.getByLabel(/Planned Value/).fill('40000');
  await page.getByLabel(/Earned Value/).fill('35000');
  await page.getByLabel(/Actual Cost/).fill('42000.50');
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the analysis');
}

const resetAction = (page: Page) => page.getByRole('button', { name: 'Start a new analysis' });
const dialog = (page: Page) => page.getByRole('alertdialog', { name: 'Start a new analysis?' });
const saved = (page: Page) =>
  page.evaluate((key) => window.sessionStorage.getItem(key), WORKFLOW_KEY);

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

test('confirms before clearing, fits the viewport, and is accessible', async ({ page }) => {
  await openAnalysis(page);
  await expect(resetAction(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);

  await resetAction(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('Project details: name, description, manager');
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();

  // The dialog fits within the viewport at this width.
  const box = await dialog(page).boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: test.info().outputPath('reset-dialog.png') });

  // Clicking the backdrop does not confirm anything.
  await page.mouse.click(2, 2);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the analysis');
});

test('Escape and Cancel keep all data and return focus to the action', async ({ page }) => {
  await openAnalysis(page);
  const before = await saved(page);

  await resetAction(page).focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(resetAction(page)).toBeFocused();

  await resetAction(page).click();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(resetAction(page)).toBeFocused();

  // The dialog can be opened again after either way of closing it.
  await resetAction(page).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');

  expect(await saved(page)).toBe(before);
  await expect(page.getByRole('region', { name: 'Confirmed EVA inputs' })).toContainText(
    '$42,000.50',
  );
});

test('keeps keyboard focus inside the dialog', async ({ page }) => {
  await openAnalysis(page);
  await resetAction(page).click();

  const cancel = dialog(page).getByRole('button', { name: 'Cancel' });
  const confirm = dialog(page).getByRole('button', { name: 'Clear and start over' });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirm).toBeFocused();
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () =>
        document.activeElement === document.body ||
        Boolean(document.activeElement?.closest('dialog[open]')),
    );
    expect(inside).toBe(true);
  }
});

test('clears everything on confirmation and returns to the landing page, including after a reload', async ({
  page,
}) => {
  await openAnalysis(page);

  await resetAction(page).click();
  await dialog(page).getByRole('button', { name: 'Clear and start over' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LANDING_TITLE);
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Workflow' })).toHaveCount(0);
  expect(await saved(page)).not.toMatch(/Billing|Private|Rahman|2026-03-31|42000|USD/);

  // Starting again shows empty project details.
  await page.getByRole('banner').getByRole('button', { name: 'Create a project' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set the project context');
  await expect(page.locator('[aria-current="step"]')).toContainText('Project details');
  for (const label of ['Project name', /Description/, /Project manager/, /Reporting date/]) {
    await expect(page.getByLabel(label)).toHaveValue('');
  }
  expect(await saved(page)).not.toMatch(/Billing|Private|Rahman|2026-03-31|42000|USD/);

  // Nothing was entered after the reset, so a reload opens the landing page again.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LANDING_TITLE);
  await page.getByRole('banner').getByRole('button', { name: 'Create a project' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('');

  // The analysis step cannot be reached until new inputs are confirmed.
  await page.getByLabel('Project name').fill('Next project');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await expect(page.getByLabel(/Actual Cost/)).toHaveValue('');
  await expect(page.getByLabel('Currency for all amounts')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'View last analysis' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/NaN|Infinity/);
  await expectNoHorizontalOverflow(page);
});
