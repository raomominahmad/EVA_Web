/**
 * The AI summary in the report, through the whole application with a mocked `fetch` (no request
 * leaves the test). The feature flag is switched per test with `vi.stubEnv`.
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkflow } from '@/app/workflow/useWorkflow';
import { WorkflowProvider } from '@/app/workflow/WorkflowProvider';
import { downloadCsv } from '@/features/export/downloadCsv';
import {
  aiSummaryResponse,
  errorResponse,
  FIXTURE_FINGERPRINT,
  jsonResponse,
} from '@/test/fixtures/aiSummary';
import { AiSummaryProvider } from './AiSummaryProvider';
import { AI_SUMMARY_READING_NOTES } from './aiSummaryMessages';
import { useAiSummary } from './useAiSummary';
import { renderApp } from '@/test/renderApp';

vi.mock('@/features/export/downloadCsv', () => ({ downloadCsv: vi.fn() }));

const downloadMock = vi.mocked(downloadCsv);
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

interface Deferred {
  resolve: (response: Response) => void;
  signal: AbortSignal | undefined;
}

/**
 * Makes every fetch wait until the test answers it; returns the pending calls. With
 * `ignoreAbort`, the fetch keeps going after an abort, like a response already on its way.
 */
function deferFetch({ ignoreAbort = false } = {}): Deferred[] {
  const calls: Deferred[] = [];
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise<Response>((resolve, reject) => {
        calls.push({ resolve, signal: init?.signal ?? undefined });
        if (ignoreAbort) return;
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
  return calls;
}

function answerWith(response: () => Response) {
  fetchMock.mockImplementation(() => Promise.resolve(response()));
}

beforeEach(() => {
  downloadMock.mockClear();
  fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new Error('Unexpected request.')));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_AI_SUMMARY_ENABLED', 'true');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fillInputs(user: UserEvent, values: Record<'bac' | 'pv' | 'ev' | 'ac', string>) {
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

const FIXTURE_VALUES = { bac: '100000', pv: '40000', ev: '35000', ac: '42000' };

async function openReport(user: UserEvent) {
  const view = renderApp();
  await user.type(screen.getByLabelText('Project name'), 'Secret project name');
  await user.type(screen.getByLabelText(/Project manager/), 'Private Manager');
  await user.type(screen.getByLabelText(/Reporting date/), '2026-03-31');
  await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));
  await user.selectOptions(screen.getByLabelText('Currency for all amounts'), 'USD');
  await fillInputs(user, FIXTURE_VALUES);
  await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
  await screen.findByRole('heading', { level: 1, name: 'Read the analysis' });
  return view;
}

async function recalculate(user: UserEvent, ac: string) {
  await user.click(screen.getByRole('button', { name: 'Edit inputs' }));
  const input = screen.getByLabelText(/Actual Cost/);
  await user.clear(input);
  await user.type(input, ac);
  await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
  await screen.findByRole('heading', { level: 1, name: 'Read the analysis' });
}

const aiRegion = () => screen.getByRole('region', { name: 'AI-generated summary' });
const generateButton = () => screen.getByRole('button', { name: 'Generate AI summary' });

async function generateSuccessfully(user: UserEvent) {
  answerWith(() => jsonResponse(200, aiSummaryResponse()));
  await user.click(generateButton());
  await within(aiRegion()).findByText(aiSummaryResponse().content.summary);
}

describe('AI summary feature flag', () => {
  it('shows no AI section or action and sends nothing when the flag is off', async () => {
    vi.stubEnv('VITE_AI_SUMMARY_ENABLED', 'false');
    await openReport(userEvent.setup());
    expect(screen.queryByRole('region', { name: 'AI-generated summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /AI summary/ })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers the action in the report, before the assumptions, without requesting anything', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /AI summary/ })).not.toBeInTheDocument();
    cleanup();

    await openReport(user);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(-3)).toEqual([
      'Budget versus actual',
      'AI-generated summary',
      'Assumptions and limitations',
    ]);
    expect(aiRegion()).toHaveTextContent('may be incomplete or wrong');
    expect(aiRegion()).toHaveTextContent(
      'The project name, description, manager, and reporting date are never sent.',
    );
    expect(generateButton()).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AI summary generation', () => {
  it('sends only the currency and the confirmed inputs', async () => {
    const user = userEvent.setup();
    await openReport(user);
    await generateSuccessfully(user);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/ai-summary');
    expect(JSON.parse(init?.body as string)).toEqual({
      schemaVersion: 1,
      currency: 'USD',
      inputs: { bac: 100000, pv: 40000, ev: 35000, ac: 42000 },
    });
    expect(init?.body).not.toMatch(/Secret project|Private Manager|2026-03-31/);
  });

  it('shows a loading state and ignores further clicks while a request is pending', async () => {
    const user = userEvent.setup();
    await openReport(user);
    const calls = deferFetch();

    await user.click(generateButton());
    const pending = screen.getByRole('button', { name: 'Generating…' });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(within(aiRegion()).getByRole('status')).toHaveTextContent('Generating the AI summary…');
    expect(aiRegion().querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'true');

    await user.click(pending);
    await user.dblClick(pending);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The rest of the report stays usable while loading.
    await user.click(screen.getByRole('button', { name: 'Download report (CSV)' }));
    expect(downloadMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      calls[0]?.resolve(jsonResponse(200, aiSummaryResponse()));
      await Promise.resolve();
    });
    expect(
      await within(aiRegion()).findByText(aiSummaryResponse().content.summary),
    ).toBeInTheDocument();
  });

  it('renders the five parts as AI-generated, with evidence from the deterministic analysis', async () => {
    const user = userEvent.setup();
    await openReport(user);
    await generateSuccessfully(user);
    const section = aiRegion();

    expect(within(section).getByText('AI-generated')).toBeInTheDocument();
    expect(section).toHaveTextContent('Model: openai/gpt-oss-120b');
    expect(section.querySelector('time')).toHaveAttribute('datetime', '2026-11-11T10:15:00.000Z');
    for (const part of [
      'Summary',
      'Observations',
      'Cost risks',
      'Recommendations',
      'Limitations',
    ]) {
      expect(within(section).getByRole('heading', { level: 3, name: part })).toBeInTheDocument();
    }

    const observations = within(section).getByRole('region', { name: 'Observations' });
    // Observation items, not their evidence chips.
    const [first, second] = within(observations)
      .getAllByRole('listitem')
      .filter((item) => !item.parentElement?.hasAttribute('aria-label'));
    expect(first).toHaveTextContent('Unfavorable');
    expect(first).toHaveTextContent('CV -$7,000.00');
    expect(first).toHaveTextContent('CPI 0.8333');
    expect(second).toHaveTextContent('Neutral');
    expect(second).toHaveTextContent('Budget variance $58,000.00');
    expect(within(section).getByRole('region', { name: 'Cost risks' })).toHaveTextContent(
      'EAC $120,000.00',
    );
    expect(within(section).getByRole('region', { name: 'Recommendations' })).toHaveTextContent(
      'AC $42,000.00',
    );
    expect(within(section).getByRole('region', { name: 'Limitations' })).toHaveTextContent(
      'Planned completion 40.0%',
    );
    expect(within(section).getByTitle('Cost Performance Index')).toHaveTextContent('CPI');
    expect(screen.getByRole('button', { name: 'Regenerate AI summary' })).toBeEnabled();
  });

  it('shows each assessment as text, including not assessable', async () => {
    const user = userEvent.setup();
    await openReport(user);
    const response = aiSummaryResponse();
    response.content.observations = [
      { text: 'Favorable item.', assessment: 'favorable', evidence: ['budgetVariance'] },
      { text: 'Unassessable item.', assessment: 'notAssessable', evidence: ['tcpiEac'] },
    ];
    answerWith(() => jsonResponse(200, response));
    await user.click(generateButton());
    const observations = await within(aiRegion()).findByRole('region', { name: 'Observations' });
    expect(observations).toHaveTextContent('FavorableFavorable item.');
    expect(observations).toHaveTextContent('Not assessableUnassessable item.');
  });

  it('omits empty parts', async () => {
    const user = userEvent.setup();
    await openReport(user);
    const response = aiSummaryResponse();
    response.content.costRisks = [];
    response.content.limitations = [];
    answerWith(() => jsonResponse(200, response));
    await user.click(generateButton());
    await within(aiRegion()).findByRole('region', { name: 'Observations' });
    expect(within(aiRegion()).queryByRole('region', { name: 'Cost risks' })).toBeNull();
    expect(within(aiRegion()).queryByRole('region', { name: 'Limitations' })).toBeNull();
  });

  it('states the assumptions and limits of the AI reading as fixed EVA text, apart from the AI content', async () => {
    const user = userEvent.setup();
    await openReport(user);
    expect(
      within(aiRegion()).queryByRole('region', { name: 'How to read the AI text' }),
    ).toBeNull();

    await generateSuccessfully(user);
    const notes = within(aiRegion()).getByRole('region', { name: 'How to read the AI text' });

    expect(notes).toHaveTextContent('Written by EVA, not generated by the AI.');
    for (const note of AI_SUMMARY_READING_NOTES) expect(notes).toHaveTextContent(note);
    // Outside the AI-generated content, so the fixed text is never read as generated text.
    const summaryPart = within(aiRegion()).getByRole('region', { name: 'Summary' });
    expect(summaryPart.parentElement?.contains(notes)).toBe(false);
  });

  it('renders AI text as plain text, never as HTML', async () => {
    const user = userEvent.setup();
    await openReport(user);
    const response = aiSummaryResponse();
    response.content.summary = '<img src="x" onerror="alert(1)"> **bold** [link](https://x.y)';
    answerWith(() => jsonResponse(200, response));
    await user.click(generateButton());

    expect(await within(aiRegion()).findByText(response.content.summary)).toBeInTheDocument();
    expect(aiRegion().querySelector('img, a, strong')).toBeNull();
  });
});

describe('AI summary errors', () => {
  it('offers a retry for a retryable error, and only an explicit click retries', async () => {
    const user = userEvent.setup();
    await openReport(user);
    answerWith(() => errorResponse(503, 'ai_unavailable', true));
    await user.click(generateButton());

    expect(
      await within(aiRegion()).findByText('The AI service is unavailable. Try again later.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    answerWith(() => jsonResponse(200, aiSummaryResponse()));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await within(aiRegion()).findByText(aiSummaryResponse().content.summary);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [errorResponse(429, 'rate_limited', true, { 'Retry-After': '12' }), 'Try again in 12 seconds.'],
    [errorResponse(502, 'invalid_ai_response', true), 'did not pass validation'],
    [errorResponse(502, 'ai_provider_error', true), 'The AI service returned an error.'],
    [errorResponse(504, 'ai_timeout', true), 'did not respond in time'],
    [new Response('Bad gateway', { status: 502 }), 'The AI service is not running.'],
  ])('shows a concise message with a retry (%#)', async (response, message) => {
    const user = userEvent.setup();
    await openReport(user);
    answerWith(() => response);
    await user.click(generateButton());
    await waitFor(() => expect(within(aiRegion()).getByRole('status')).toHaveTextContent(message));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('shows the not-configured note without any action', async () => {
    const user = userEvent.setup();
    await openReport(user);
    answerWith(() => errorResponse(503, 'ai_not_configured', false));
    await user.click(generateButton());
    expect(await within(aiRegion()).findByText(/no AI model configured/)).toBeInTheDocument();
    expect(within(aiRegion()).queryByRole('button')).toBeNull();
  });

  it('never shows the server or provider wording of an error', async () => {
    const user = userEvent.setup();
    await openReport(user);
    answerWith(() =>
      jsonResponse(502, {
        error: {
          code: 'ai_provider_error',
          message: 'Groq: invalid_api_key not-a-real-key at stack trace',
          retryable: true,
        },
      }),
    );
    await user.click(generateButton());
    await within(aiRegion()).findByText(/The AI service returned an error/);
    expect(document.body.textContent).not.toMatch(
      /Groq:|invalid_api_key|not-a-real-key|stack trace/,
    );
  });

  it('does not display a summary that describes other inputs', async () => {
    const user = userEvent.setup();
    await openReport(user);
    answerWith(() => jsonResponse(200, aiSummaryResponse({ inputFingerprint: 'v1:USD:1:1:1:1' })));
    await user.click(generateButton());
    expect(
      await within(aiRegion()).findByText(/could not be used for this analysis/),
    ).toBeVisible();
    expect(screen.queryByText(aiSummaryResponse().content.summary)).not.toBeInTheDocument();
  });

  it('shows the timed-out state after 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      await openReport(user);
      deferFetch();
      await user.click(generateButton());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(within(aiRegion()).getByText(/took too long \(30 seconds\)/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AI summary lifecycle', () => {
  it('cancel aborts the request and returns to the initial state silently', async () => {
    const user = userEvent.setup();
    await openReport(user);
    const calls = deferFetch();
    await user.click(generateButton());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(generateButton()).toBeEnabled();
    expect(within(aiRegion()).getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps the summary while the draft changes without recalculation', async () => {
    const user = userEvent.setup();
    await openReport(user);
    await generateSuccessfully(user);

    await user.click(screen.getByRole('button', { name: 'Edit inputs' }));
    const ac = screen.getByLabelText(/Actual Cost/);
    await user.clear(ac);
    await user.type(ac, '99999');
    await user.click(screen.getByRole('button', { name: 'View last analysis' }));

    expect(
      screen.getByText('This report uses the previously confirmed inputs'),
    ).toBeInTheDocument();
    expect(within(aiRegion()).getByText(aiSummaryResponse().content.summary)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the summary when different inputs are confirmed, without a new request', async () => {
    const user = userEvent.setup();
    await openReport(user);
    await generateSuccessfully(user);

    await recalculate(user, '45000');
    expect(screen.queryByText(aiSummaryResponse().content.summary)).not.toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the summary when the same inputs are confirmed again (same fingerprint)', async () => {
    const user = userEvent.setup();
    await openReport(user);
    await generateSuccessfully(user);
    await recalculate(user, '42000');
    expect(within(aiRegion()).getByText(aiSummaryResponse().content.summary)).toBeInTheDocument();
  });

  it('discards a response that arrives after its analysis was replaced', async () => {
    const user = userEvent.setup();
    await openReport(user);
    const calls = deferFetch({ ignoreAbort: true });
    await user.click(generateButton());

    await recalculate(user, '45000');
    expect(calls[0]?.signal?.aborted).toBe(true);

    // Even if the old answer still arrives, it is not shown.
    await act(async () => {
      calls[0]?.resolve(jsonResponse(200, aiSummaryResponse()));
      await Promise.resolve();
    });
    expect(screen.queryByText(aiSummaryResponse().content.summary)).not.toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
    expect(within(aiRegion()).getByRole('status')).toBeEmptyDOMElement();
  });

  it('clears the summary when the user starts a new analysis (FR-11)', async () => {
    const user = userEvent.setup();
    await openReport(user);
    await generateSuccessfully(user);

    await user.click(screen.getByRole('button', { name: 'Start a new analysis' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('any AI-generated summary');
    await user.click(screen.getByRole('button', { name: 'Clear and start over' }));
    await user.click(screen.getAllByRole('button', { name: 'Create a project' })[0]!);

    // Same project and inputs again: the old summary does not come back, and nothing is sent.
    await user.type(screen.getByLabelText('Project name'), 'Secret project name');
    await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));
    await user.selectOptions(screen.getByLabelText('Currency for all amounts'), 'USD');
    await fillInputs(user, FIXTURE_VALUES);
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
    await screen.findByRole('heading', { level: 1, name: 'Read the analysis' });
    expect(screen.queryByText(aiSummaryResponse().content.summary)).not.toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending request on reset and never shows its late response', async () => {
    const user = userEvent.setup();
    await openReport(user);
    const calls = deferFetch({ ignoreAbort: true });
    await user.click(generateButton());
    expect(within(aiRegion()).getByRole('status')).toHaveTextContent('Generating the AI summary…');

    await user.click(screen.getByRole('button', { name: 'Start a new analysis' }));
    await user.click(screen.getByRole('button', { name: 'Clear and start over' }));
    await user.click(screen.getAllByRole('button', { name: 'Create a project' })[0]!);
    expect(calls[0]?.signal?.aborted).toBe(true);

    // Confirm the same inputs again, then let the old answer arrive.
    await user.type(screen.getByLabelText('Project name'), 'Secret project name');
    await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));
    await user.selectOptions(screen.getByLabelText('Currency for all amounts'), 'USD');
    await fillInputs(user, FIXTURE_VALUES);
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
    await screen.findByRole('heading', { level: 1, name: 'Read the analysis' });
    await act(async () => {
      calls[0]?.resolve(jsonResponse(200, aiSummaryResponse()));
      await Promise.resolve();
    });

    expect(screen.queryByText(aiSummaryResponse().content.summary)).not.toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
    expect(within(aiRegion()).getByRole('status')).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the summary when the reset is cancelled', async () => {
    const user = userEvent.setup();
    await openReport(user);
    await generateSuccessfully(user);

    await user.click(screen.getByRole('button', { name: 'Start a new analysis' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(within(aiRegion()).getByText(aiSummaryResponse().content.summary)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the summary in memory only: a reload does not restore it', async () => {
    const user = userEvent.setup();
    const { unmount } = await openReport(user);
    await generateSuccessfully(user);
    const summary = aiSummaryResponse().content.summary;

    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) ?? '';
        expect(storage.getItem(key)).not.toContain(summary);
        expect(storage.getItem(key)).not.toContain(FIXTURE_FINGERPRINT);
      }
    }
    expect(window.sessionStorage.getItem('eva.workflow.v1')).not.toMatch(/ai|summary/i);

    unmount();
    renderApp(); // A reload: the workflow is restored from sessionStorage, the summary is not.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Read the analysis' }),
    ).toBeVisible();
    expect(screen.queryByText(summary)).not.toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/** A minimal harness for provider transitions (reset, unmounting) without the full UI. */
function Harness() {
  const { state, dispatch } = useWorkflow();
  const { view, generate } = useAiSummary();
  return (
    <>
      <p data-testid="view">{view.status}</p>
      <p data-testid="confirmed">{state.confirmed ? 'yes' : 'no'}</p>
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: 'CONFIRM_INPUTS',
            confirmed: {
              currency: 'USD',
              inputs: { bac: 100000, pv: 40000, ev: 35000, ac: 42000 },
            },
          })
        }
      >
        Confirm
      </button>
      <button type="button" onClick={generate}>
        Generate
      </button>
      <button type="button" onClick={() => dispatch({ type: 'RESET' })}>
        Reset
      </button>
    </>
  );
}

function renderHarness() {
  return render(
    <WorkflowProvider>
      <AiSummaryProvider>
        <Harness />
      </AiSummaryProvider>
    </WorkflowProvider>,
  );
}

describe('AI summary provider', () => {
  it('clears the summary on reset, and does not bring it back for the same inputs', async () => {
    const user = userEvent.setup();
    renderHarness();
    answerWith(() => jsonResponse(200, aiSummaryResponse()));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('success')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByTestId('confirmed')).toHaveTextContent('no');
    expect(screen.getByTestId('view')).toHaveTextContent('idle');

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByTestId('view')).toHaveTextContent('idle');
  });

  it('aborts on reset and ignores the late response', async () => {
    const user = userEvent.setup();
    renderHarness();
    const calls = deferFetch({ ignoreAbort: true });
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(screen.getByTestId('view')).toHaveTextContent('loading');

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(calls[0]?.signal?.aborted).toBe(true);
    await act(async () => {
      calls[0]?.resolve(jsonResponse(200, aiSummaryResponse()));
      await Promise.resolve();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('idle');
  });

  it('aborts on unmount and makes no state update afterwards', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const user = userEvent.setup();
    const { unmount } = renderHarness();
    const calls = deferFetch({ ignoreAbort: true });
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    unmount();
    expect(calls[0]?.signal?.aborted).toBe(true);
    await act(async () => {
      calls[0]?.resolve(jsonResponse(200, aiSummaryResponse()));
      await Promise.resolve();
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('makes no request when the flag is off, even if generate is called', async () => {
    vi.stubEnv('VITE_AI_SUMMARY_ENABLED', '');
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(screen.getByTestId('view')).toHaveTextContent('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AI summary in the CSV export', () => {
  it('exports the current summary as AI-generated rows without another request', async () => {
    const user = userEvent.setup();
    await openReport(user);

    await user.click(screen.getByRole('button', { name: 'Download report (CSV)' }));
    expect(downloadMock.mock.calls[0]?.[0]).not.toContain('AI-generated summary');

    await generateSuccessfully(user);
    await user.click(screen.getByRole('button', { name: 'Download report (CSV)' }));
    const csv = downloadMock.mock.calls[1]?.[0] ?? '';
    expect(csv).toContain('AI-generated summary,Summary,,,,,,');
    expect(csv).toContain(aiSummaryResponse().content.summary);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not export a summary after different inputs are confirmed', async () => {
    const user = userEvent.setup();
    await openReport(user);
    await generateSuccessfully(user);
    await recalculate(user, '45000');
    await user.click(screen.getByRole('button', { name: 'Download report (CSV)' }));
    expect(downloadMock.mock.calls[0]?.[0]).not.toContain('AI-generated');
  });
});
