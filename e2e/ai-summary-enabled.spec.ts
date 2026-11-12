/**
 * The AI summary in a build with `VITE_AI_SUMMARY_ENABLED=true` (run by `playwright.ai.config.ts`).
 * `/api/ai-summary` is answered by Playwright with the shared contract fixture; any other `/api`
 * request is aborted, so neither the local backend nor Groq can be reached.
 */
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request, Route } from '@playwright/test';
import { aiSummaryResponse } from '../src/test/fixtures/aiSummary.ts';
import { LANDING_TITLE, openProjectDetails } from './landing';

const RAW_PROVIDER_DETAIL = 'Groq upstream: invalid_api_key not-a-real-key at stack trace';

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

interface Mock {
  requests: Request[];
  /** Answers the next pending request (requests wait until answered). */
  answer: (respond: (route: Route) => Promise<void>) => void;
}

/** Holds every `/api/ai-summary` request until the test answers it. */
async function mockAiEndpoint(page: Page): Promise<Mock> {
  const requests: Request[] = [];
  const waiting: ((respond: (route: Route) => Promise<void>) => void)[] = [];
  const answers: ((route: Route) => Promise<void>)[] = [];

  // Registered first, so it applies only when nothing more specific matches: no other `/api`
  // request may leave the page.
  await page.route('**/api/**', (route) => route.abort());
  await page.route('**/api/ai-summary', async (route) => {
    requests.push(route.request());
    const respond =
      answers.shift() ??
      (await new Promise<(route: Route) => Promise<void>>((resolve) => waiting.push(resolve)));
    await respond(route);
  });

  return {
    requests,
    answer: (respond) => {
      const next = waiting.shift();
      if (next) next(respond);
      else answers.push(respond);
    },
  };
}

const success = (route: Route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify(aiSummaryResponse()),
  });

const unavailable = (route: Route) =>
  route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({
      error: { code: 'ai_unavailable', message: RAW_PROVIDER_DETAIL, retryable: true },
    }),
  });

async function calculate(page: Page) {
  await openProjectDetails(page);
  await page.getByLabel('Project name').fill('Confidential Apollo Project');
  await page.getByLabel(/Description/).fill('Private description text');
  await page.getByLabel(/Project manager/).fill('Jordan Private-Manager');
  await page.getByLabel(/Reporting date/).fill('2026-03-31');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await page.getByLabel('Currency for all amounts').selectOption('USD');
  await page.getByLabel(/Budget at Completion/).fill('100,000');
  await page.getByLabel(/Planned Value/).fill('40000');
  await page.getByLabel(/Earned Value/).fill('35000');
  await page.getByLabel(/Actual Cost/).fill('42000');
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the analysis');
}

const section = (page: Page) => page.getByRole('region', { name: 'AI-generated summary' });
const status = (page: Page) => section(page).getByRole('status');

test('generates a summary on request only, with one minimal request and a loading state', async ({
  page,
}) => {
  const mock = await mockAiEndpoint(page);
  await calculate(page);

  // The section is offered, but opening the report sends nothing.
  await expect(section(page)).toBeVisible();
  await expect(section(page)).toContainText('may be incomplete or wrong');
  await expect(section(page)).toContainText(
    'The project name, description, manager, and reporting date are never sent.',
  );
  await page.waitForTimeout(300);
  expect(mock.requests).toHaveLength(0);

  // Keyboard activation.
  const generate = section(page).getByRole('button', { name: 'Generate AI summary' });
  await generate.focus();
  await page.keyboard.press('Enter');

  const pending = section(page).getByRole('button', { name: 'Generating…' });
  await expect(pending).toHaveAttribute('aria-disabled', 'true');
  await expect(pending).toBeFocused();
  await expect(status(page)).toHaveText('Generating the AI summary…');
  await expect(section(page).getByRole('button', { name: 'Cancel' })).toBeVisible();

  // Repeated clicks and key presses while pending do not send another request.
  // `force`: Playwright treats aria-disabled as not actionable; a user can still click it.
  await pending.click({ force: true });
  await pending.dblclick({ force: true });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  expect(mock.requests).toHaveLength(1);

  // The rest of the report stays usable while loading.
  const downloadWhileLoading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report (CSV)' }).click();
  await downloadWhileLoading;
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);

  // Only the schema version, currency, and the four confirmed inputs are sent.
  const request = mock.requests[0]!;
  expect(request.method()).toBe('POST');
  expect(new URL(request.url()).pathname).toBe('/api/ai-summary');
  expect(request.headers()['content-type']).toContain('application/json');
  expect(request.postDataJSON()).toEqual({
    schemaVersion: 1,
    currency: 'USD',
    inputs: { bac: 100000, pv: 40000, ev: 35000, ac: 42000 },
  });
  expect(request.postData()).not.toMatch(/Apollo|Confidential|Private|Jordan|2026-03-31/);

  // Focus stays on the action through the state change (the download above moved it away).
  await pending.focus();
  mock.answer(success);
  await expect(status(page)).toHaveText('AI summary generated.');
  await expect(section(page).getByRole('button', { name: 'Regenerate AI summary' })).toBeFocused();
  expect(mock.requests).toHaveLength(1);
});

test('renders the five parts, evidence, assessments, and the AI-generated label', async ({
  page,
}) => {
  const mock = await mockAiEndpoint(page);
  mock.answer(success);
  await calculate(page);
  await section(page).getByRole('button', { name: 'Generate AI summary' }).click();

  const ai = section(page);
  const { content } = aiSummaryResponse();
  await expect(ai.getByText(content.summary)).toBeVisible();

  await expect(ai.getByText('AI-generated', { exact: true })).toBeVisible();
  await expect(ai).toContainText('Model: openai/gpt-oss-120b');
  await expect(ai.locator('time')).toHaveAttribute('datetime', '2026-11-11T10:15:00.000Z');
  for (const part of ['Summary', 'Observations', 'Cost risks', 'Recommendations', 'Limitations']) {
    await expect(ai.getByRole('heading', { level: 3, name: part })).toBeVisible();
  }

  // Assessments as text, evidence with the browser's own values.
  const observations = ai.getByRole('region', { name: 'Observations' });
  const items = observations.locator(':scope > ul > li');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Unfavorable');
  await expect(items.nth(0)).toContainText(content.observations[0]!.text);
  await expect(items.nth(0).getByRole('list', { name: /Evidence/ })).toHaveText(
    /CV\s*-\$7,000\.00\s*CPI\s*0\.8333/,
  );
  await expect(items.nth(1)).toContainText('Neutral');
  await expect(items.nth(1)).toContainText('Budget variance $58,000.00');
  await expect(ai.getByRole('region', { name: 'Cost risks' })).toContainText('EAC $120,000.00');
  await expect(ai.getByRole('region', { name: 'Recommendations' })).toContainText('AC $42,000.00');
  await expect(ai.getByRole('region', { name: 'Limitations' })).toContainText(
    'Planned completion 40.0%',
  );
  await expect(ai.getByTitle('Cost Performance Index')).toHaveText('CPI');
  await expect(page.locator('main')).not.toContainText(/NaN|Infinity/);

  // The CSV report now carries the AI rows, without another request.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report (CSV)' }).click();
  const csv = (await readFile(await (await downloadPromise).path())).toString('utf8');
  expect(csv).toContain('AI-generated summary,Notice,');
  expect(csv).toContain('AI-generated summary,Observation 1,,Unfavorable,,,"Evidence: CV, CPI.",');
  expect(mock.requests).toHaveLength(1);

  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

test('shows a useful error without provider details and retries only on request', async ({
  page,
}) => {
  const mock = await mockAiEndpoint(page);
  mock.answer(unavailable);
  await calculate(page);

  const generate = section(page).getByRole('button', { name: 'Generate AI summary' });
  await generate.focus();
  await page.keyboard.press('Enter');

  await expect(status(page)).toHaveText('The AI service is unavailable. Try again later.');
  await expect(page.locator('body')).not.toContainText(
    /Groq upstream|invalid_api_key|not-a-real-key|stack trace/,
  );
  const retry = section(page).getByRole('button', { name: 'Try again' });
  await expect(retry).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);

  // No automatic retry.
  await page.waitForTimeout(500);
  expect(mock.requests).toHaveLength(1);

  // The deterministic report is unaffected.
  await expect(page.getByRole('region', { name: 'Forecast' })).toContainText('$120,000.00');

  mock.answer(success);
  await page.keyboard.press('Space');
  await expect(section(page).getByText(aiSummaryResponse().content.summary)).toBeVisible();
  expect(mock.requests).toHaveLength(2);
});

test('a reset cancels the pending request and its late answer is never shown', async ({ page }) => {
  const mock = await mockAiEndpoint(page);
  await calculate(page);
  await section(page).getByRole('button', { name: 'Generate AI summary' }).click();
  await expect(status(page)).toHaveText('Generating the AI summary…');

  await page.getByRole('button', { name: 'Start a new analysis' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Start a new analysis?' });
  await expect(dialog).toContainText('any AI-generated summary');
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Clear and start over' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LANDING_TITLE);
  await page.getByRole('banner').getByRole('button', { name: 'Create a project' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set the project context');

  // The held request answers only now, after the reset; then the same inputs are confirmed.
  mock.answer(success);
  await page.getByLabel('Project name').fill('Next project');
  await page.getByRole('button', { name: 'Continue to EVA inputs' }).click();
  await page.getByLabel('Currency for all amounts').selectOption('USD');
  await page.getByLabel(/Budget at Completion/).fill('100,000');
  await page.getByLabel(/Planned Value/).fill('40000');
  await page.getByLabel(/Earned Value/).fill('35000');
  await page.getByLabel(/Actual Cost/).fill('42000');
  await page.getByRole('button', { name: 'Calculate analysis' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Read the analysis');

  await page.waitForTimeout(300);
  await expect(page.getByText(aiSummaryResponse().content.summary)).toHaveCount(0);
  await expect(section(page).getByRole('button', { name: 'Generate AI summary' })).toBeVisible();
  expect(mock.requests).toHaveLength(1);
});
