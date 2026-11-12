import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAiSummary } from './handler';
import { notConfiguredGenerator } from './generation';
import type { GenerationResult, SummaryGenerator } from './generation';
import { validContent } from './testSupport';

const VALID = {
  schemaVersion: 1,
  currency: 'USD',
  inputs: { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 },
};

const bytes = (value: unknown) =>
  new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

function run(
  body: unknown,
  generate: SummaryGenerator = notConfiguredGenerator,
  signal?: AbortSignal,
) {
  return handleAiSummary(
    bytes(body),
    { generate, timeoutMs: 50 },
    signal ?? new AbortController().signal,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleAiSummary', () => {
  it('answers a valid request with 503 ai_not_configured and no summary', async () => {
    const response = await run(VALID);
    expect(response).toEqual({
      status: 503,
      body: {
        error: {
          code: 'ai_not_configured',
          message: 'The AI summary is not configured on this server.',
          retryable: false,
        },
      },
    });
    expect(JSON.stringify(response)).not.toMatch(/content|summary"|observations/);
  });

  it('makes no network request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await run(VALID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and invalid UTF-8 as 400 invalid_request', async () => {
    expect((await run('{"schemaVersion":1,'))?.status).toBe(400);
    const invalidUtf8 = handleAiSummary(
      new Uint8Array([0x7b, 0xff, 0x7d]),
      { generate: notConfiguredGenerator },
      new AbortController().signal,
    );
    expect((await invalidUtf8)?.body).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('maps schema errors to 400 and EVA rule errors to 422 before generation', async () => {
    const generate = vi.fn(notConfiguredGenerator);
    expect((await run({ ...VALID, extra: 1 }, generate))?.status).toBe(400);
    expect(
      (await run({ ...VALID, inputs: { ...VALID.inputs, pv: 200_000 } }, generate))?.status,
    ).toBe(422);
    expect(generate).not.toHaveBeenCalled();
  });

  it('hands the generation layer only server-derived data', async () => {
    const generate = vi.fn<SummaryGenerator>(notConfiguredGenerator);
    await run(VALID, generate);
    const [input] = generate.mock.calls[0] ?? [];
    expect(input?.analysis.metrics.cv).toBe(-7_000);
    expect(input?.modelData.facts).toHaveLength(18);
  });

  it.each<[GenerationResult, number, string]>([
    [{ ok: false, code: 'ai_unavailable' }, 503, 'ai_unavailable'],
    [{ ok: false, code: 'ai_provider_error' }, 502, 'ai_provider_error'],
    [{ ok: false, code: 'invalid_ai_response' }, 502, 'invalid_ai_response'],
    [{ ok: false, code: 'ai_timeout' }, 504, 'ai_timeout'],
    [{ ok: false, code: 'rate_limited' }, 429, 'rate_limited'],
  ])('maps a generation failure %j to %i', async (result, status, code) => {
    const response = await run(VALID, () => Promise.resolve(result));
    expect(response).toMatchObject({ status, body: { error: { code } } });
  });

  it('sends Retry-After for a rate-limited generation', async () => {
    const response = await run(VALID, () =>
      Promise.resolve({ ok: false, code: 'rate_limited', retryAfterSeconds: 7.2 }),
    );
    expect(response?.headers).toEqual({ 'Retry-After': '8' });
  });

  it('times out a generator that never answers with 504 ai_timeout', async () => {
    let receivedSignal: AbortSignal | undefined;
    const response = await run(VALID, (_input, signal) => {
      receivedSignal = signal;
      return new Promise(() => {});
    });
    expect(response).toMatchObject({ status: 504, body: { error: { code: 'ai_timeout' } } });
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('returns the §11.3 success response with a server-computed fingerprint', async () => {
    const generate: SummaryGenerator = () =>
      Promise.resolve({ ok: true, content: validContent(), modelLabel: 'openai/gpt-oss-120b' });
    const response = await handleAiSummary(
      bytes({ ...VALID, inputs: { ac: 42_000, ev: 35_000, pv: 40_000, bac: 100_000 } }),
      { generate, now: () => new Date('2026-11-11T10:15:00Z') },
      new AbortController().signal,
    );
    expect(response).toEqual({
      status: 200,
      body: {
        schemaVersion: 1,
        inputFingerprint: 'v1:USD:100000:40000:35000:42000',
        generatedAt: '2026-11-11T10:15:00.000Z',
        modelLabel: 'openai/gpt-oss-120b',
        content: validContent(),
      },
    });
  });

  it('ignores any fingerprint a client tries to supply', async () => {
    const response = await run({ ...VALID, inputFingerprint: 'v1:USD:1:0:0:0' }, () =>
      Promise.resolve({ ok: true, content: validContent(), modelLabel: 'm' }),
    );
    expect(response?.status).toBe(400);
  });

  it('rejects a success response larger than 16 KiB', async () => {
    // Within every count and length limit, but '€' is 3 bytes in UTF-8.
    const text = '€'.repeat(400);
    const item = { text, evidence: ['bac' as const] };
    const content = {
      summary: '€'.repeat(600),
      observations: Array.from({ length: 6 }, () => ({ ...item, assessment: 'neutral' as const })),
      costRisks: [item, item, item, item],
      recommendations: [item, item, item, item],
      limitations: [item, item, item, item],
    };
    const response = await run(VALID, () =>
      Promise.resolve({ ok: true, content, modelLabel: 'm' }),
    );
    expect(response).toMatchObject({
      status: 502,
      body: { error: { code: 'invalid_ai_response' } },
    });
  });

  it('never returns a summary that arrives after the client disconnected', async () => {
    const controller = new AbortController();
    const pending = run(
      VALID,
      () => {
        controller.abort();
        return Promise.resolve({ ok: true, content: validContent(), modelLabel: 'm' });
      },
      controller.signal,
    );
    expect(await pending).toBeNull();
  });

  it('returns nothing when the client disconnects during generation', async () => {
    const controller = new AbortController();
    const pending = run(VALID, () => new Promise(() => {}), controller.signal);
    controller.abort();
    expect(await pending).toBeNull();
  });
});
