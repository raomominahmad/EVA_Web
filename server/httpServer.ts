import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AI_SUMMARY_ROUTE, MAX_REQUEST_BYTES } from './contract.ts';
import type { AiSummaryErrorBody, AiSummaryErrorCode } from './contract.ts';
import { errorResponse } from './errors.ts';
import type { ApiResponse } from './errors.ts';
import { handleAiSummary } from './handler.ts';
import type { HandlerDependencies } from './handler.ts';
import type { RequestLogger } from './logger.ts';

/** The backend only ever listens here (`DECISIONS.md` §8.5.7). Not configurable. */
export const LOOPBACK_HOST = '127.0.0.1';

export interface ApiServerOptions extends HandlerDependencies {
  /** Browser origins allowed to call the API, e.g. `http://127.0.0.1:5173`. */
  allowedOrigins: readonly string[];
  log: RequestLogger;
}

type BodyResult = { kind: 'ok'; body: Buffer } | { kind: 'tooLarge' } | { kind: 'aborted' };

/** Reads at most `limit` bytes and stops collecting as soon as the limit is passed. */
function readBody(request: IncomingMessage, limit: number): Promise<BodyResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const finish = (result: BodyResult) => {
      if (settled) return;
      settled = true;
      request.off('data', onData).off('end', onEnd).off('error', onAbort).off('close', onClose);
      if (result.kind === 'tooLarge') request.resume(); // Discard the rest without buffering it.
      resolve(result);
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) finish({ kind: 'tooLarge' });
      else chunks.push(chunk);
    };
    const onEnd = () => finish({ kind: 'ok', body: Buffer.concat(chunks) });
    const onAbort = () => finish({ kind: 'aborted' });
    const onClose = () => {
      if (!request.complete) onAbort();
    };

    request.on('data', onData).on('end', onEnd).on('error', onAbort).on('close', onClose);
  });
}

/** `127.0.0.1:<port>` or `localhost:<port>` only, which defeats DNS rebinding. */
function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `${LOOPBACK_HOST}:${port}` || host === `localhost:${port}`;
}

/** `application/json`, optionally with `charset=utf-8`. */
function isJsonContentType(header: string | undefined): boolean {
  if (header === undefined) return false;
  const [mediaType, ...parameters] = header.split(';').map((part) => part.trim().toLowerCase());
  return (
    mediaType === 'application/json' &&
    parameters.every(
      (parameter) => !parameter.startsWith('charset=') || parameter === 'charset=utf-8',
    )
  );
}

/**
 * The local Node.js platform adapter. It applies the local security checks, reads the body
 * within the size limit, and passes it to the handler core. It never sends CORS headers, and it
 * logs only a request id, time, status, error code, and duration.
 *
 * Check order: Host → route → Origin → method → content type → size → handler core.
 */
export function createApiServer(options: ApiServerOptions): Server {
  const allowedOrigins = new Set(options.allowedOrigins);
  const loggedCodes = new WeakMap<ServerResponse, AiSummaryErrorCode>();
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000 });

  function send(response: ServerResponse, result: ApiResponse, close = false) {
    if (response.headersSent || response.destroyed) return;
    const code = (result.body as Partial<AiSummaryErrorBody>).error?.code;
    if (code) loggedCodes.set(response, code);
    const payload = JSON.stringify(result.body);
    response.writeHead(result.status, {
      ...result.headers,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // On rejections the body may be unread; closing keeps it from being parsed as a request.
      ...(close ? { Connection: 'close' } : {}),
    });
    response.end(payload);
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const port = (server.address() as AddressInfo).port;
    const reject = (code: AiSummaryErrorCode, headers?: Record<string, string>) =>
      send(response, errorResponse(code, undefined, headers), true);

    if (!isAllowedHost(request.headers.host, port)) return reject('forbidden');

    const path = (request.url ?? '').split('?')[0];
    if (path !== AI_SUMMARY_ROUTE) return reject('not_found');

    const origin = request.headers.origin;
    if (origin === undefined || !allowedOrigins.has(origin)) return reject('forbidden');

    if (request.method !== 'POST') return reject('method_not_allowed', { Allow: 'POST' });

    if (!isJsonContentType(request.headers['content-type'])) return reject('unsupported_media');

    const declaredLength = Number(request.headers['content-length'] ?? 0);
    if (!(declaredLength <= MAX_REQUEST_BYTES)) return reject('payload_too_large');

    const body = await readBody(request, MAX_REQUEST_BYTES);
    if (body.kind === 'aborted') return;
    if (body.kind === 'tooLarge') return reject('payload_too_large');

    const controller = new AbortController();
    response.once('close', () => {
      if (!response.writableFinished) controller.abort();
    });

    const result = await handleAiSummary(body.body, options, controller.signal);
    if (result !== null) send(response, result);
  }

  server.on('request', (request: IncomingMessage, response: ServerResponse) => {
    const requestId = randomUUID();
    const started = performance.now();

    response.once('close', () => {
      const code = loggedCodes.get(response);
      options.log({
        requestId,
        time: new Date().toISOString(),
        status: response.writableFinished ? response.statusCode : null,
        ...(code ? { code } : {}),
        durationMs: Math.round(performance.now() - started),
      });
    });

    handle(request, response).catch(() => {
      // Never expose or log the error itself: it could contain request data.
      if (response.headersSent) response.destroy();
      else send(response, errorResponse('internal_error'), true);
    });
  });

  // Malformed HTTP (including a missing Host header) is left to Node's default handling, which
  // answers a bare `400 Bad Request`, closes the socket, and logs nothing.
  return server;
}
