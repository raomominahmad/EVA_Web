import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { connect } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notConfiguredGenerator } from './generation';
import { LOOPBACK_HOST, createApiServer } from './httpServer';
import type { RequestLogEntry } from './logger';

const ORIGIN = 'http://127.0.0.1:5173';
const SENSITIVE = { bac: 987_654.32, pv: 123_456.78, ev: 111_111.11, ac: 222_222.22 };
const VALID_BODY = JSON.stringify({ schemaVersion: 1, currency: 'USD', inputs: SENSITIVE });

let server: Server;
let port: number;
let logs: RequestLogEntry[];

beforeEach(async () => {
  logs = [];
  server = createApiServer({
    generate: notConfiguredGenerator,
    allowedOrigins: [ORIGIN, 'http://localhost:5173'],
    log: (entry) => logs.push(entry),
  });
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK_HOST, resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

interface Sent {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

function send({
  method = 'POST',
  path = '/api/ai-summary',
  headers = {},
  body,
}: {
  method?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  body?: string | undefined;
} = {}): Promise<Sent> {
  const defaults: Record<string, string> = {
    Host: `127.0.0.1:${port}`,
    Origin: ORIGIN,
    'Content-Type': 'application/json',
  };
  const merged = Object.fromEntries(
    Object.entries({ ...defaults, ...headers }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: LOOPBACK_HOST, port, method, path, headers: merged, setHost: false },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

function errorCode(response: Sent): string | undefined {
  return (JSON.parse(response.body) as { error?: { code?: string } }).error?.code;
}

function expectSafeJsonError(response: Sent, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toBe('application/json');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(errorCode(response)).toBe(code);
  expect(response.body).not.toMatch(/stack|Error:|at .*\(|node:/);
}

describe('local API server', () => {
  it('listens on 127.0.0.1 only', () => {
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });

  it('answers a valid POST with 503 ai_not_configured and no AI content', async () => {
    const response = await send({ body: VALID_BODY });
    expectSafeJsonError(response, 503, 'ai_not_configured');
    expect(JSON.parse(response.body)).toEqual({
      error: {
        code: 'ai_not_configured',
        message: 'The AI summary is not configured on this server.',
        retryable: false,
      },
    });
  });

  it('accepts the localhost spelling of the host and origin, and a UTF-8 charset', async () => {
    const response = await send({
      headers: {
        Host: `localhost:${port}`,
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: VALID_BODY,
    });
    expect(response.status).toBe(503);
  });

  it.each(['GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])(
    'rejects %s with 405 and Allow: POST',
    async (method) => {
      // Node's client sends no body framing for GET, DELETE, and OPTIONS, so only send a body
      // with the methods that frame one.
      const withBody = method === 'PUT' || method === 'PATCH';
      const response = await send({ method, body: withBody ? VALID_BODY : undefined });
      expectSafeJsonError(response, 405, 'method_not_allowed');
      expect(response.headers.allow).toBe('POST');
    },
  );

  it.each(['/', '/api', '/api/ai-summary/', '/api/other', '/API/AI-SUMMARY'])(
    'returns 404 for the unknown route %s',
    async (path) => {
      expectSafeJsonError(await send({ path, body: VALID_BODY }), 404, 'not_found');
    },
  );

  it('ignores a query string on the endpoint', async () => {
    expect((await send({ path: '/api/ai-summary?x=1', body: VALID_BODY })).status).toBe(503);
  });

  it.each([
    ['another website', 'https://evil.example'],
    ['another local port', 'http://127.0.0.1:4173'],
    ['the null origin', 'null'],
    ['a lookalike', 'http://127.0.0.1:5173.evil.example'],
  ])('rejects requests from %s with 403', async (_label, origin) => {
    expectSafeJsonError(
      await send({ headers: { Origin: origin }, body: VALID_BODY }),
      403,
      'forbidden',
    );
  });

  it('rejects a request without an Origin header with 403', async () => {
    expectSafeJsonError(
      await send({ headers: { Origin: undefined }, body: VALID_BODY }),
      403,
      'forbidden',
    );
  });

  it.each([
    ['a rebinding domain', 'attacker.example:PORT'],
    ['the wrong port', '127.0.0.1:1'],
    ['no port', '127.0.0.1'],
    ['a LAN address', '192.168.1.10:PORT'],
  ])('rejects an unexpected Host (%s) with 403', async (_label, host) => {
    const response = await send({
      headers: { Host: host.replace('PORT', String(port)) },
      body: VALID_BODY,
    });
    expectSafeJsonError(response, 403, 'forbidden');
  });

  it('rejects a request with no Host header (Node answers a bare 400 before the handler)', async () => {
    const response = await send({ headers: { Host: undefined }, body: VALID_BODY });
    expect(response.status).toBe(400);
    expect(response.body).not.toContain('ai_not_configured');
  });

  it.each([
    undefined,
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'application/json; charset=latin1',
  ])('rejects the content type %s with 415', async (contentType) => {
    const response = await send({ headers: { 'Content-Type': contentType }, body: VALID_BODY });
    expectSafeJsonError(response, 415, 'unsupported_media');
  });

  it('accepts a body of exactly 2,048 bytes and rejects 2,049 bytes with 413', async () => {
    const padded = (size: number) =>
      VALID_BODY.slice(0, -1) + ' '.repeat(size - VALID_BODY.length) + '}';
    expect((await send({ body: padded(2048) })).status).toBe(503);
    expectSafeJsonError(await send({ body: padded(2049) }), 413, 'payload_too_large');
  });

  it('rejects an oversized chunked body (no Content-Length) with 413', async () => {
    const response = await new Promise<Sent>((resolve, reject) => {
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
          res.on('data', (chunk: Buffer) => (text += chunk.toString()));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }),
          );
        },
      );
      req.on('error', reject);
      req.write('x'.repeat(1500));
      req.end('x'.repeat(1500));
    });
    expectSafeJsonError(response, 413, 'payload_too_large');
  });

  it('maps malformed JSON, schema, and EVA errors to the documented codes', async () => {
    expectSafeJsonError(await send({ body: '{"schemaVersion":1' }), 400, 'invalid_request');
    expectSafeJsonError(await send({ body: '' }), 400, 'invalid_request');
    expectSafeJsonError(
      await send({ body: VALID_BODY.replace('"USD"', '"XYZ"') }),
      400,
      'invalid_request',
    );
    expectSafeJsonError(
      await send({
        body: JSON.stringify({
          schemaVersion: 1,
          currency: 'USD',
          inputs: { bac: 1, pv: 2, ev: 0, ac: 0 },
        }),
      }),
      422,
      'invalid_inputs',
    );
  });

  it('never sends CORS headers, even to an allowed origin', async () => {
    for (const response of [
      await send({ body: VALID_BODY }),
      await send({ method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST' } }),
      await send({ headers: { Origin: 'https://evil.example' }, body: VALID_BODY }),
    ]) {
      expect(
        Object.keys(response.headers).filter((name) => name.startsWith('access-control-')),
      ).toEqual([]);
    }
  });

  it('survives a client that disconnects mid-body and keeps serving', async () => {
    await new Promise<void>((resolve) => {
      const socket = connect(port, LOOPBACK_HOST, () => {
        socket.write(
          `POST /api/ai-summary HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${ORIGIN}\r\nContent-Type: application/json\r\nContent-Length: 200\r\n\r\n{"schemaVersion":`,
        );
        setTimeout(() => {
          socket.destroy();
          resolve();
        }, 20);
      });
    });
    expect((await send({ body: VALID_BODY })).status).toBe(503);
    await vi.waitFor(() => expect(logs.some((entry) => entry.status === null)).toBe(true));
  });

  it('answers malformed HTTP with a bare 400', async () => {
    const reply = await new Promise<string>((resolve) => {
      const socket = connect(port, LOOPBACK_HOST, () => socket.write('NOT HTTP\r\n\r\n'));
      let text = '';
      socket.on('data', (chunk) => (text += chunk.toString()));
      socket.on('close', () => resolve(text));
    });
    expect(reply).toMatch(/^HTTP\/1\.1 400 Bad Request/);
  });

  it('logs only id, time, status, code, and duration; never inputs, headers, or bodies', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    await send({ body: VALID_BODY });
    await send({ headers: { Origin: 'https://evil.example' }, body: VALID_BODY });
    await send({ body: VALID_BODY.replace('"USD"', '"XYZ"') });
    await vi.waitFor(() => expect(logs).toHaveLength(3));

    for (const entry of logs) {
      expect(Object.keys(entry).sort()).toEqual(
        expect.arrayContaining(['durationMs', 'requestId', 'status', 'time']),
      );
      expect(
        Object.keys(entry).every((key) =>
          ['requestId', 'time', 'status', 'code', 'durationMs'].includes(key),
        ),
      ).toBe(true);
    }
    expect(logs.map((entry) => entry.code)).toEqual([
      'ai_not_configured',
      'forbidden',
      'invalid_request',
    ]);

    const logged = JSON.stringify(logs);
    for (const secret of [
      '987654',
      '123456',
      '222222',
      'evil.example',
      'USD',
      'XYZ',
      'schemaVersion',
    ]) {
      expect(logged).not.toContain(secret);
    }
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
