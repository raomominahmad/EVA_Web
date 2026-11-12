import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openProjectDetails } from './landing';

const STEPS = [
  { currentLabel: 'Project details', heading: 'Set the project context' },
  { currentLabel: 'EVA inputs', heading: 'Enter the four EVA values' },
  { currentLabel: 'Analysis', heading: 'Read the analysis' },
] as const;

async function expectStep(page: Page, index: number) {
  const step = STEPS[index];

  if (!step) {
    throw new Error(`Unknown step index: ${index}`);
  }

  await expect(page.getByRole('heading', { level: 1, name: step.heading })).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(page.locator('[aria-current="step"]')).toContainText(step.currentLabel);
  await expect(page.locator('h1')).toHaveCount(1);
}

async function completeProject(page: Page) {
  await page.getByLabel('Project name').fill('Billing platform, "core" release');
  await page.getByLabel('Description').fill('Line one,\nline "two"');
  await page.getByLabel('Project manager').fill('A. Rahman');
  await page.getByLabel('Reporting date').fill('2026-03-31');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
}

async function completeInputs(page: Page) {
  await page.getByLabel('Currency for all amounts').selectOption('USD');
  await page.getByLabel(/Budget at Completion/).fill('100,000');
  await page.getByLabel(/Planned Value/).fill('40000');
  await page.getByLabel(/Earned Value/).fill('35000');
  await page.getByLabel(/Actual Cost/).fill('42000');
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
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

test('renders the application shell and starts at project details', async ({ page }) => {
  await openProjectDetails(page);

  await expect(page).toHaveTitle('EVA · Earned Value Analysis');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workflow' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
    'href',
    '#main-content',
  );
  await expectStep(page, 0);
});

test('completes the workflow and preserves data when navigating back', async ({ page }) => {
  await openProjectDetails(page);

  await completeProject(page);
  await expectStep(page, 1);
  await expect(page.getByRole('main')).toBeFocused();

  await completeInputs(page);
  await expectStep(page, 2);
  await expect(page.getByText('March 31, 2026')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Confirmed EVA inputs' }).getByText('$100,000.00'),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/NaN|Infinity/);

  await page.getByRole('button', { name: 'Edit EVA inputs' }).click();
  await expectStep(page, 1);
  await expect(page.getByLabel(/Budget at Completion/)).toHaveValue('100,000');

  await page.getByRole('button', { name: 'Back to project details' }).click();
  await expectStep(page, 0);
  await expect(page.getByLabel('Project name')).toHaveValue('Billing platform, "core" release');
  await expect(page.getByLabel('Description')).toHaveValue('Line one,\nline "two"');
});

test('restores the workflow after a page reload', async ({ page }) => {
  await openProjectDetails(page);
  await completeProject(page);
  await completeInputs(page);
  await expectStep(page, 2);

  await page.reload();

  await expectStep(page, 2);
  await expect(
    page.getByRole('region', { name: 'Confirmed EVA inputs' }).getByText('$42,000.00'),
  ).toBeVisible();
});

test('shows field errors and focuses the first invalid field', async ({ page }) => {
  await openProjectDetails(page);

  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await expect(page.getByLabel('Project name')).toBeFocused();
  await expect(page.getByText('Enter a project name.')).toBeVisible();

  await page.getByLabel('Project name').fill('Billing platform');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await expectStep(page, 1);

  await page.getByLabel('Currency for all amounts').selectOption('EUR');
  await page.getByLabel(/Budget at Completion/).fill('1,000');
  await page.getByLabel(/Planned Value/).fill('1,23,4');
  await page.getByRole('button', { name: 'Calculate analysis' }).click();

  await expect(page.getByLabel(/Planned Value/)).toBeFocused();
  await expect(page.getByText(/Check the thousands separators in PV/)).toBeVisible();
  await expect(page.getByText('Enter the Earned Value (EV).')).toBeVisible();
});

test('rejects extra decimal places for the currency without rounding the entry', async ({
  page,
}) => {
  await openProjectDetails(page);
  await page.getByLabel('Project name').fill('Precision check');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await expectStep(page, 1);

  await page.getByLabel('Currency for all amounts').selectOption('USD');
  await page.getByLabel(/Budget at Completion/).fill('100,000');
  await page.getByLabel(/Planned Value/).fill('40000');
  await page.getByLabel(/Earned Value/).fill('35000');
  await page.getByLabel(/Actual Cost/).fill('100.125');
  await page.getByRole('button', { name: 'Calculate analysis' }).click();

  // The analysis is not confirmed, the raw text is kept, and the message names the rule.
  await expectStep(page, 1);
  await expect(page.getByLabel(/Actual Cost/)).toBeFocused();
  await expect(page.getByLabel(/Actual Cost/)).toHaveValue('100.125');
  await expect(page.getByText('AC can have at most 2 decimal places in USD.')).toBeVisible();

  await page.getByLabel(/Actual Cost/).fill('100.12');
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the analysis');
  await expect(
    page.getByRole('region', { name: 'Confirmed EVA inputs' }).getByText('$100.12'),
  ).toBeVisible();
});

test('skip link moves keyboard focus to the main content', async ({ page }) => {
  await page.goto('/');

  // The skip link is rendered by React after the page's load event. Pressing Tab before it
  // exists moves focus past it, so wait until it is in the document.
  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await expect(skipLink).toBeAttached();

  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();

  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.getByRole('main')).toBeFocused();
});

test('does not overflow the viewport and has no detectable WCAG A/AA violations', async ({
  page,
}) => {
  await openProjectDetails(page);

  await expectStep(page, 0);
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);

  // Error state on the project step.
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await expectNoAxeViolations(page);

  await completeProject(page);
  await expectStep(page, 1);
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);

  // Error state on the inputs step.
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);

  await completeInputs(page);
  await expectStep(page, 2);
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});
