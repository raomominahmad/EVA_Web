import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const LANDING_TITLE = 'Understand project performance. Make smarter decisions.';

/** Opens the root URL, which shows the landing page, and starts a project from the hero. */
export async function openProjectDetails(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LANDING_TITLE);
  await page
    .getByRole('region', { name: LANDING_TITLE })
    .getByRole('button', { name: 'Create a project' })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set the project context');
}
