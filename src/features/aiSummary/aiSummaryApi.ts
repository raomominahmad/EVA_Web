/**
 * Browser client for `POST /api/ai-summary` (`docs/PROJECT_REQUIREMENTS.md` §11). It sends only
 * the currency and the four confirmed inputs, gives up after 30 seconds (§11.7), never retries,
 * and turns every outcome into a small typed result. Text from error responses is never returned,
 * so no server or provider wording can reach the page.
 */
import {
  AI_SUMMARY_ROUTE,
  AI_SUMMARY_SCHEMA_VERSION,
  ASSESSMENTS,
  EVIDENCE_KEYS,
} from '../../../server/contract.ts';
import type {
  AiSummaryErrorCode,
  AiSummaryRequest,
  AiSummaryResponse,
} from '../../../server/contract.ts';
import type { CurrencyCode } from '@/domain/currency';
import type { EvaInputs } from '@/domain/evaTypes';

export type {
  AiSummaryErrorCode,
  AiSummaryItem,
  AiSummaryObservation,
  AiSummaryResponse,
  Assessment,
  EvidenceKey,
} from '../../../server/contract.ts';

/** The browser deadline (§11.7). The server answers `504 ai_timeout` after 25 seconds. */
export const AI_SUMMARY_CLIENT_TIMEOUT_MS = 30_000;

const ERROR_CODES: readonly AiSummaryErrorCode[] = [
  'invalid_request',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'payload_too_large',
  'unsupported_media',
  'invalid_inputs',
  'rate_limited',
  'invalid_ai_response',
  'ai_provider_error',
  'ai_not_configured',
  'ai_unavailable',
  'ai_timeout',
  'internal_error',
];

export type AiSummaryFailure =
  /** The backend answered with the §11.6 error schema. */
  | { kind: 'server'; code: AiSummaryErrorCode; retryable: boolean; retryAfterSeconds?: number }
  /** No answer within the browser deadline. */
  | { kind: 'timeout' }
  /** The local backend could not be reached, or something other than it answered. */
  | { kind: 'unreachable' }
  /** A 200 response that does not match the contract, or describes other inputs. */
  | { kind: 'invalidResponse' };

export type AiSummaryOutcome =
  | { kind: 'success'; response: AiSummaryResponse }
  | { kind: 'failure'; failure: AiSummaryFailure }
  /** Cancelled by the caller. Not a failure: nothing is shown for it. */
  | { kind: 'aborted' };

export interface AiSummaryRequestInput {
  currency: CurrencyCode;
  inputs: EvaInputs;
}

export interface AiSummaryRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetch?: typeof fetch | undefined;
}

/** Builds the request body field by field, so nothing else can be added to it by mistake. */
export function buildAiSummaryRequest({
  currency,
  inputs,
}: AiSummaryRequestInput): AiSummaryRequest {
  return {
    schemaVersion: AI_SUMMARY_SCHEMA_VERSION,
    currency,
    inputs: { bac: inputs.bac, pv: inputs.pv, ev: inputs.ev, ac: inputs.ac },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasEvidence(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((key) => (EVIDENCE_KEYS as readonly unknown[]).includes(key))
  );
}

function isItem(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.text) && hasEvidence(value.evidence);
}

function isObservation(value: unknown): boolean {
  return (
    isItem(value) && (ASSESSMENTS as readonly unknown[]).includes((value as never)['assessment'])
  );
}

/**
 * A structural check before anything is rendered. The server's validation (§11.4) is authoritative;
 * this only makes sure the page never renders something that is not the documented shape.
 */
export function isAiSummaryResponse(value: unknown): value is AiSummaryResponse {
  if (!isRecord(value) || !isRecord(value.content)) return false;
  const { content } = value;
  return (
    value.schemaVersion === AI_SUMMARY_SCHEMA_VERSION &&
    isNonEmptyString(value.inputFingerprint) &&
    isNonEmptyString(value.generatedAt) &&
    !Number.isNaN(Date.parse(value.generatedAt)) &&
    isNonEmptyString(value.modelLabel) &&
    isNonEmptyString(content.summary) &&
    Array.isArray(content.observations) &&
    content.observations.length > 0 &&
    content.observations.every(isObservation) &&
    [content.costRisks, content.recommendations, content.limitations].every(
      (list) => Array.isArray(list) && list.every(isItem),
    )
  );
}

function readServerError(body: unknown, headers: Headers): AiSummaryFailure | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, retryable } = body.error;
  if (!(ERROR_CODES as readonly unknown[]).includes(code) || typeof retryable !== 'boolean') {
    return null;
  }
  const retryAfter = headers.get('retry-after');
  const seconds = retryAfter !== null && /^\d{1,6}$/.test(retryAfter) ? Number(retryAfter) : null;
  return {
    kind: 'server',
    code: code as AiSummaryErrorCode,
    retryable,
    ...(seconds === null ? {} : { retryAfterSeconds: seconds }),
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    // An abort while the body is read must still be reported as an abort.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return undefined;
  }
}

/** Sends one request. Never retries; the caller decides whether the user may try again. */
export async function requestAiSummary(
  input: AiSummaryRequestInput,
  options: AiSummaryRequestOptions = {},
): Promise<AiSummaryOutcome> {
  const { signal, timeoutMs = AI_SUMMARY_CLIENT_TIMEOUT_MS, fetch: fetchImpl = fetch } = options;
  if (signal?.aborted) return { kind: 'aborted' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetchImpl(AI_SUMMARY_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(buildAiSummaryRequest(input)),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const body = await readJson(response);

    if (response.ok) {
      return isAiSummaryResponse(body)
        ? { kind: 'success', response: body }
        : { kind: 'failure', failure: { kind: 'invalidResponse' } };
    }
    // Anything without the backend's error schema (for example the development proxy reporting
    // that the backend is not running) means the local AI service could not be reached.
    return {
      kind: 'failure',
      failure: readServerError(body, response.headers) ?? { kind: 'unreachable' },
    };
  } catch {
    if (signal?.aborted) return { kind: 'aborted' };
    return { kind: 'failure', failure: timedOut ? { kind: 'timeout' } : { kind: 'unreachable' } };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
