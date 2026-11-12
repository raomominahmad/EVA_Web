/**
 * The landing page at the root URL and the ways into the workflow. Runs at desktop (1440×900)
 * and mobile (375×812) widths like every other spec.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { LANDING_TITLE } from './landing';

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

const ctas: Record<string, (page: Page) => Locator> = {
  header: (page) => page.getByRole('banner').getByRole('button', { name: 'Create a project' }),
  hero: (page) =>
    page
      .getByRole('region', { name: LANDING_TITLE })
      .getByRole('button', { name: 'Create a project' }),
  closing: (page) =>
    page
      .getByRole('region', { name: 'Turn project numbers into meaningful insights.' })
      .getByRole('button', { name: 'Create your first analysis' }),
};

test('the root URL opens the landing page, which is accessible and fits the viewport', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LANDING_TITLE);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Workflow' })).toHaveCount(0);
  await expect(page.getByLabel('Project name')).toHaveCount(0);

  const preview = page.getByRole('figure', { name: 'Sample report preview' });
  await expect(preview).toContainText('Sample data — Illustrative analysis');
  await expect(preview).toContainText('0.8333');

  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\bNaN\b|Infinity|undefined/);
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

test('"Explore sample report" moves to the sample report preview', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Explore sample report' }).click();

  await expect(page).toHaveURL(/#sample-report$/);
  await expect(page.getByRole('figure', { name: 'Sample report preview' })).toBeInViewport();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LANDING_TITLE);
});

test('the footer link moves to the how-it-works section, below the sticky header', async ({
  page,
}) => {
  await page.goto('/');

  await page
    .getByRole('navigation', { name: 'Footer' })
    .getByRole('link', { name: 'How it works' })
    .click();

  await expect(page).toHaveURL(/#how-it-works$/);
  const heading = page.getByRole('heading', { level: 2, name: 'How it works' });
  await expect(heading).toBeInViewport();
  // The sticky header never covers the heading it scrolled to. The scroll is smooth, so this is
  // measured once it has finished rather than mid-animation.
  const headerBottom = await page
    .getByRole('banner')
    .evaluate((el) => el.getBoundingClientRect().bottom);
  await expect
    .poll(() => heading.evaluate((el) => el.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(headerBottom);
});

for (const [name, cta] of Object.entries(ctas)) {
  test(`the ${name} call to action opens empty project details`, async ({ page }) => {
    await page.goto('/');

    await cta(page).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set the project context');
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page.locator('[aria-current="step"]')).toContainText('Project details');
    await expect(page.getByLabel('Project name')).toHaveValue('');
    await expectNoHorizontalOverflow(page);
  });
}

test('a reload with work in progress returns to the saved step, not the landing page', async ({
  page,
}) => {
  await page.goto('/');
  await ctas.hero!(page).click();
  await page.getByLabel('Project name').fill('Billing platform');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enter the four EVA values');

  await page.reload();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enter the four EVA values');
  await page.getByRole('button', { name: 'Back to project details' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Billing platform');
});
