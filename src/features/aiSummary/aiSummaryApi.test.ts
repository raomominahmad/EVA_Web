import { describe, expect, it, vi } from 'vitest';
import {
  aiSummaryResponse,
  errorResponse,
  FIXTURE_FINGERPRINT,
  jsonResponse,
} from '@/test/fixtures/aiSummary';
import { isAiSummaryResponse, requestAiSummary } from './aiSummaryApi';

const INPUT = {
  currency: 'USD',
  inputs: { bac: 100000, pv: 40000, ev: 35000, ac: 42000 },
} as const;

function mockFetch(respond: (init: RequestInit | undefined) => Response | Promise<Response>) {
  return vi.fn<typeof fetch>((_url, init) => Promise.resolve(respond(init)));
}

/** A fetch that never answers, but rejects like the browser when its signal is aborted. */
function hangingFetch() {
  return vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
  );
}

describe('requestAiSummary request', () => {
  it('posts JSON to /api/ai-summary', async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, aiSummaryResponse()));
    await requestAiSummary(INPUT, { fetch: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/ai-summary');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends only the schema version, currency, and BAC, PV, EV, AC', async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, aiSummaryResponse()));
    // Extra properties on the caller's objects must never reach the request.
    const input = {
      ...INPUT,
      projectName: 'Billing platform',
      inputs: { ...INPUT.inputs, cpi: 0.8333, manager: 'A. Rahman' },
    };
    await requestAiSummary(input, { fetch: fetchMock });

    const body = fetchMock.mock.calls[0]?.[1]?.body as string;
    expect(JSON.parse(body)).toEqual({
      schemaVersion: 1,
      currency: 'USD',
      inputs: { bac: 100000, pv: 40000, ev: 35000, ac: 42000 },
    });
    expect(body).not.toMatch(/Billing|Rahman|projectName|manager|cpi|reportingDate|description/);
  });
});

describe('requestAiSummary responses', () => {
  it('returns a valid response unchanged', async () => {
    const response = aiSummaryResponse();
    const outcome = await requestAiSummary(INPUT, {
      fetch: mockFetch(() => jsonResponse(200, response)),
    });
    expect(outcome).toEqual({ kind: 'success', response });
    expect(outcome.kind === 'success' && outcome.response.inputFingerprint).toBe(
      FIXTURE_FINGERPRINT,
    );
  });

  it('treats a 200 that does not match the contract as an invalid response', async () => {
    for (const body of [
      { ...aiSummaryResponse(), schemaVersion: 2 },
      { ...aiSummaryResponse(), content: { summary: 'Only a summary.' } },
      { ...aiSummaryResponse(), generatedAt: 'yesterday' },
      'not json',
    ]) {
      const outcome = await requestAiSummary(INPUT, {
        fetch: mockFetch(() => jsonResponse(200, body)),
      });
      expect(outcome).toEqual({ kind: 'failure', failure: { kind: 'invalidResponse' } });
    }
  });

  it('parses the backend error schema, keeping only code, retryability, and Retry-After', async () => {
    const outcome = await requestAiSummary(INPUT, {
      fetch: mockFetch(() => errorResponse(429, 'rate_limited', true, { 'Retry-After': '12' })),
    });
    expect(outcome).toEqual({
      kind: 'failure',
      failure: { kind: 'server', code: 'rate_limited', retryable: true, retryAfterSeconds: 12 },
    });

    const notConfigured = await requestAiSummary(INPUT, {
      fetch: mockFetch(() => errorResponse(503, 'ai_not_configured', false)),
    });
    expect(notConfigured).toEqual({
      kind: 'failure',
      failure: { kind: 'server', code: 'ai_not_configured', retryable: false },
    });
    // The server's message text is not carried into the result.
    expect(JSON.stringify(notConfigured)).not.toContain('Server message');
  });

  it('ignores a malformed Retry-After header', async () => {
    const outcome = await requestAiSummary(INPUT, {
      fetch: mockFetch(() => errorResponse(429, 'rate_limited', true, { 'Retry-After': 'soon' })),
    });
    expect(outcome).toEqual({
      kind: 'failure',
      failure: { kind: 'server', code: 'rate_limited', retryable: true },
    });
  });

  it('reports responses without the error schema as an unreachable service', async () => {
    for (const response of [
      new Response('Proxy error: connect ECONNREFUSED', { status: 500 }),
      jsonResponse(502, { error: { code: 'something_else', retryable: true } }),
    ]) {
      expect(await requestAiSummary(INPUT, { fetch: mockFetch(() => response) })).toEqual({
        kind: 'failure',
        failure: { kind: 'unreachable' },
      });
    }
  });

  it('reports network failures as an unreachable service', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await requestAiSummary(INPUT, { fetch: fetchMock })).toEqual({
      kind: 'failure',
      failure: { kind: 'unreachable' },
    });
  });

  it('times out after the deadline and aborts the request', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = hangingFetch();
      const pending = requestAiSummary(INPUT, { fetch: fetchMock });
      await vi.advanceTimersByTimeAsync(29_999);
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ kind: 'failure', failure: { kind: 'timeout' } });
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a caller abort as aborted, not as a failure', async () => {
    const fetchMock = hangingFetch();
    const controller = new AbortController();
    const pending = requestAiSummary(INPUT, { fetch: fetchMock, signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ kind: 'aborted' });
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);

    const fetchNever = hangingFetch();
    expect(
      await requestAiSummary(INPUT, { fetch: fetchNever, signal: AbortSignal.abort() }),
    ).toEqual({ kind: 'aborted' });
    expect(fetchNever).not.toHaveBeenCalled();
  });
});

describe('isAiSummaryResponse', () => {
  it('rejects unknown evidence keys and assessments', () => {
    const badEvidence = aiSummaryResponse();
    (badEvidence.content.costRisks[0] as { evidence: string[] }).evidence = ['projectName'];
    expect(isAiSummaryResponse(badEvidence)).toBe(false);

    const badAssessment = aiSummaryResponse();
    (badAssessment.content.observations[0] as { assessment: string }).assessment = 'good';
    expect(isAiSummaryResponse(badAssessment)).toBe(false);

    expect(isAiSummaryResponse(aiSummaryResponse())).toBe(true);
  });
});
