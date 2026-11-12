import { describe, expect, it, vi } from 'vitest';
import { GROQ_CHAT_COMPLETIONS_URL, createGroqAdapter } from './groqAdapter';
import { Secret } from './secret';
import { PROVIDER_SCHEMA, SUMMARY_SYSTEM_PROMPT } from './summaryPrompt';
import { TEST_API_KEY, groqCompletion } from './testSupport';

const REQUEST = {
  system: SUMMARY_SYSTEM_PROMPT,
  data: '<eva_data>{}</eva_data>',
  schema: PROVIDER_SCHEMA,
};

function adapterWith(respond: () => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(respond()));
  const adapter = createGroqAdapter({
    apiKey: new Secret(TEST_API_KEY),
    model: 'openai/gpt-oss-120b',
    fetch: fetchMock,
  });
  return { adapter, fetchMock };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const signal = () => new AbortController().signal;

describe('Groq adapter request', () => {
  it('posts one strict structured-output chat completion with Bearer auth', async () => {
    const { adapter, fetchMock } = adapterWith(() => json(200, groqCompletion('{}')));
    const abort = new AbortController();
    await adapter.generate(REQUEST, abort.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(url).toBe(GROQ_CHAT_COMPLETIONS_URL);
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBe(abort.signal);
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${TEST_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });

    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: '<eva_data>{}</eva_data>' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'eva_ai_summary', strict: true, schema: PROVIDER_SCHEMA },
      },
      max_completion_tokens: 2048,
      temperature: 0.2,
      reasoning_effort: 'low',
      include_reasoning: false,
      stream: false,
    });
    for (const absent of ['max_tokens', 'tools', 'tool_choice', 'functions', 'n', 'user']) {
      expect(body).not.toHaveProperty(absent);
    }
  });
});

describe('Groq adapter responses', () => {
  it('returns the raw message text of a complete answer', async () => {
    const { adapter } = adapterWith(() => json(200, groqCompletion('{"summary":"x"}')));
    expect(await adapter.generate(REQUEST, signal())).toEqual({
      ok: true,
      text: '{"summary":"x"}',
    });
  });

  it('rejects truncated output (finish_reason length) and empty content', async () => {
    const truncated = adapterWith(() => json(200, groqCompletion('{"summary":"cut', 'length')));
    expect(await truncated.adapter.generate(REQUEST, signal())).toEqual({
      ok: false,
      code: 'invalid_ai_response',
    });
    const empty = adapterWith(() => json(200, groqCompletion('  ')));
    expect(await empty.adapter.generate(REQUEST, signal())).toMatchObject({
      code: 'invalid_ai_response',
    });
  });

  it.each([
    ['a non-JSON body', 'upstream proxy error page'],
    ['no choices', { choices: [] }],
    ['an unexpected structure', { result: 'text' }],
    ['a missing message', { choices: [{ finish_reason: 'stop' }] }],
  ])('maps a 200 with %s to ai_provider_error', async (_label, body) => {
    const { adapter } = adapterWith(() => json(200, body));
    expect(await adapter.generate(REQUEST, signal())).toEqual({
      ok: false,
      code: 'ai_provider_error',
    });
  });

  it.each([
    [401, 'ai_not_configured'],
    [403, 'ai_not_configured'],
    [422, 'invalid_ai_response'],
    [498, 'ai_unavailable'],
    [503, 'ai_unavailable'],
    [500, 'ai_provider_error'],
    [502, 'ai_provider_error'],
    [404, 'ai_provider_error'],
    [413, 'ai_provider_error'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const { adapter } = adapterWith(() =>
      json(status, { error: { message: `secret-provider-detail ${TEST_API_KEY}`, type: 'x' } }),
    );
    const result = await adapter.generate(REQUEST, signal());
    expect(result).toEqual({ ok: false, code });
    expect(JSON.stringify(result)).not.toMatch(/secret-provider-detail|test-only-not-a-real/);
  });

  it('maps a 400 schema mismatch to invalid_ai_response and other 400s to ai_provider_error', async () => {
    const mismatch = adapterWith(() =>
      json(400, {
        error: {
          message: 'Generated JSON does not match the expected schema. Please adjust your prompt.',
          type: 'invalid_request_error',
        },
      }),
    );
    expect(await mismatch.adapter.generate(REQUEST, signal())).toMatchObject({
      code: 'invalid_ai_response',
    });
    const blocked = adapterWith(() =>
      json(400, { error: { message: 'Spend limit reached', type: 'blocked_api_access' } }),
    );
    expect(await blocked.adapter.generate(REQUEST, signal())).toMatchObject({
      code: 'ai_provider_error',
    });
  });

  it('maps 429 to rate_limited with retry-after seconds when present', async () => {
    const withHeader = adapterWith(() => json(429, { error: {} }, { 'retry-after': '12' }));
    expect(await withHeader.adapter.generate(REQUEST, signal())).toEqual({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 12,
    });
    const badHeader = adapterWith(() => json(429, { error: {} }, { 'retry-after': 'soon' }));
    expect(await badHeader.adapter.generate(REQUEST, signal())).toEqual({
      ok: false,
      code: 'rate_limited',
    });
  });

  it('maps network failures to ai_unavailable and aborted calls to ai_timeout', async () => {
    const network = adapterWith(() =>
      Promise.reject(new TypeError(`fetch failed ${TEST_API_KEY}`)),
    );
    const result = await network.adapter.generate(REQUEST, signal());
    expect(result).toEqual({ ok: false, code: 'ai_unavailable' });

    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    const adapter = createGroqAdapter({
      apiKey: new Secret(TEST_API_KEY),
      model: 'openai/gpt-oss-120b',
      fetch: fetchMock,
    });
    const pending = adapter.generate(REQUEST, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ ok: false, code: 'ai_timeout' });
  });

  it('treats an oversized provider body as malformed', async () => {
    const { adapter } = adapterWith(() => json(200, 'x'.repeat(300 * 1024)));
    expect(await adapter.generate(REQUEST, signal())).toMatchObject({ code: 'ai_provider_error' });
  });
});
