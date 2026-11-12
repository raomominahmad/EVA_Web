/**
 * End to end through the real HTTP server, handler, prompt, validator, and Groq adapter, with
 * `fetch` mocked. The global `fetch` is replaced by a function that fails the test, so nothing
 * can reach Groq.
 */
import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProviderGenerator } from './generation';
import { createGroqAdapter } from './groqAdapter';
import { LOOPBACK_HOST, createApiServer } from './httpServer';
import type { RequestLogEntry } from './logger';
import { Secret } from './secret';
import { FIXTURE_REQUEST, TEST_API_KEY, groqCompletion, validContent } from './testSupport';

const ORIGIN = 'http://127.0.0.1:5173';
const MODEL = 'openai/gpt-oss-120b';

let server: Server;
let port: number;
let logs: RequestLogEntry[];
let groqFetch: ReturnType<typeof vi.fn<typeof fetch>>;

async function start(
  respond: (init: RequestInit | undefined) => Promise<Response>,
  timeoutMs = 25_000,
) {
  groqFetch = vi.fn<typeof fetch>((_url, init) => respond(init));
  const adapter = createGroqAdapter({
    apiKey: new Secret(TEST_API_KEY),
    model: MODEL,
    fetch: groqFetch,
  });
  server = createApiServer({
    generate: createProviderGenerator(adapter, MODEL),
    timeoutMs,
    allowedOrigins: [ORIGIN],
    log: (entry) => logs.push(entry),
  });
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK_HOST, resolve));
  port = (server.address() as AddressInfo).port;
}

beforeEach(() => {
  logs = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('A test tried to use the real network.');
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

interface Sent {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

function post(body: unknown = FIXTURE_REQUEST, abortAfterMs?: number): Promise<Sent | 'aborted'> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: LOOPBACK_HOST,
        port,
        method: 'POST',
        path: '/api/ai-summary',
        headers: {
          Host: `127.0.0.1:${port}`,
          Origin: ORIGIN,
          'Content-Type': 'application/json',
        },
        setHost: false,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }),
        );
      },
    );
    req.on('error', (error) => (abortAfterMs === undefined ? reject(error) : resolve('aborted')));
    req.end(JSON.stringify(body));
    if (abortAfterMs !== undefined) setTimeout(() => req.destroy(), abortAfterMs);
  });
}

const ok = (content: unknown) =>
  Promise.resolve(new Response(groqCompletion(JSON.stringify(content)), { status: 200 }));

function expectNoLeak(text: string) {
  expect(text).not.toContain(TEST_API_KEY);
  expect(text).not.toMatch(/eva_data|experienced project cost analyst|Groq|groq/);
}

describe('AI summary end to end (mocked Groq)', () => {
  it('returns a validated summary for a valid request', async () => {
    await start(() => ok(validContent()));
    const response = (await post()) as Sent;

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      schemaVersion: 1,
      inputFingerprint: 'v1:USD:100000:40000:35000:42000',
      modelLabel: MODEL,
      content: validContent(),
    });
    expect(Object.keys(body).sort()).toEqual(
      ['content', 'generatedAt', 'inputFingerprint', 'modelLabel', 'schemaVersion'].sort(),
    );

    expect(groqFetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(groqFetch.mock.calls[0]?.[1]?.body as string) as {
      model: string;
      messages: { content: string }[];
    };
    expect(sent.model).toBe(MODEL);
    expect(sent.messages[1]?.content).toContain('"display":"$42,000.00"');
    expect(JSON.stringify(sent)).not.toMatch(/projectName|manager|reportingDate/);
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it('rejects provider output with an invented number as 502 invalid_ai_response', async () => {
    const content = validContent();
    content.costRisks[0]!.text = 'The project may finish 25% above budget.';
    await start(() => ok(content));
    const response = (await post()) as Sent;
    expect(response.status).toBe(502);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: 'invalid_ai_response' } });
    expectNoLeak(response.body);
  });

  it('rejects invalid JSON from the provider and truncated output', async () => {
    await start(() =>
      Promise.resolve(new Response(groqCompletion('{"summary":'), { status: 200 })),
    );
    expect(JSON.parse(((await post()) as Sent).body)).toMatchObject({
      error: { code: 'invalid_ai_response' },
    });
  });

  it.each([
    [401, 503, 'ai_not_configured'],
    [403, 503, 'ai_not_configured'],
    [500, 502, 'ai_provider_error'],
    [503, 503, 'ai_unavailable'],
  ])('maps Groq %i to %i %s without leaking provider details', async (groqStatus, status, code) => {
    await start(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { message: `Invalid API Key ${TEST_API_KEY}`, type: 'invalid_request_error' },
          }),
          { status: groqStatus },
        ),
      ),
    );
    const response = (await post()) as Sent;
    expect(response.status).toBe(status);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code } });
    expect(response.body).not.toContain('Invalid API Key');
    expectNoLeak(response.body);
  });

  it('passes a Groq 429 through as 429 with Retry-After', async () => {
    await start(() =>
      Promise.resolve(
        new Response('{"error":{}}', { status: 429, headers: { 'retry-after': '9' } }),
      ),
    );
    const response = (await post()) as Sent;
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('9');
    expect(JSON.parse(response.body)).toMatchObject({
      error: { code: 'rate_limited', retryable: true },
    });
  });

  it('times out a slow provider with 504 and aborts the Groq request', async () => {
    let providerSignal: AbortSignal | undefined;
    await start((init) => {
      providerSignal = init?.signal ?? undefined;
      return new Promise(() => {});
    }, 50);
    const response = (await post()) as Sent;
    expect(response.status).toBe(504);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: 'ai_timeout' } });
    expect(providerSignal?.aborted).toBe(true);
  });

  it('aborts the Groq request when the browser disconnects', async () => {
    let providerSignal: AbortSignal | undefined;
    await start((init) => {
      providerSignal = init?.signal ?? undefined;
      return new Promise(() => {});
    });
    expect(await post(FIXTURE_REQUEST, 50)).toBe('aborted');
    await vi.waitFor(() => expect(providerSignal?.aborted).toBe(true));
    await vi.waitFor(() => expect(logs.at(-1)?.status).toBeNull());
  });

  it('never logs the key, prompts, inputs, or AI content', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    await start(() => ok(validContent()));
    await post();
    await vi.waitFor(() => expect(logs).toHaveLength(1));
    const logged = JSON.stringify(logs);
    expectNoLeak(logged);
    expect(logged).not.toMatch(/100000|42000|Cost performance|CPI/);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
