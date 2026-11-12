import { createAnalysis } from '../src/domain/analysis.ts';
import { inputFingerprint } from '../src/domain/inputFingerprint.ts';
import { AI_SUMMARY_SCHEMA_VERSION, MAX_RESPONSE_BYTES, PROVIDER_TIMEOUT_MS } from './contract.ts';
import type { AiSummaryRequest, AiSummaryResponse } from './contract.ts';
import { errorResponse } from './errors.ts';
import type { ApiResponse } from './errors.ts';
import type { GenerationResult, SummaryGenerator, SummaryInput } from './generation.ts';
import { buildModelData } from './modelData.ts';
import { validateAiSummaryRequest } from './requestValidation.ts';

export interface HandlerDependencies {
  generate: SummaryGenerator;
  /** Deadline for the generation layer; `PROVIDER_TIMEOUT_MS` unless a test overrides it. */
  timeoutMs?: number;
  /** Clock for `generatedAt`; injected in tests. */
  now?: () => Date;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** Derives everything the model may see from the four validated inputs, on the server only. */
export function prepareSummaryInput(request: AiSummaryRequest): SummaryInput {
  const analysis = createAnalysis(request.currency, request.inputs);
  return { analysis, modelData: buildModelData(analysis) };
}

type Outcome = GenerationResult | { ok: false; code: 'ai_timeout' } | { aborted: true };

/** Runs the generator against the client's signal and the server deadline, whichever ends first. */
async function runGenerator(
  generate: SummaryGenerator,
  input: SummaryInput,
  clientSignal: AbortSignal,
  timeoutMs: number,
): Promise<Outcome> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([clientSignal, deadline]);
  const stopped = new Promise<Outcome>((resolve) => {
    const settle = () =>
      resolve(clientSignal.aborted ? { aborted: true } : { ok: false, code: 'ai_timeout' });
    if (signal.aborted) settle();
    else signal.addEventListener('abort', settle, { once: true });
  });
  return Promise.race([generate(input, signal), stopped]);
}

/**
 * Handler core for `POST /api/ai-summary`, independent of the HTTP server. It receives the raw
 * body (already size-limited by the platform adapter) and returns a response, or `null` when the
 * client went away and nothing should be sent.
 */
export async function handleAiSummary(
  rawBody: Uint8Array,
  dependencies: HandlerDependencies,
  clientSignal: AbortSignal,
): Promise<ApiResponse | null> {
  let text: string;
  let body: unknown;
  try {
    text = utf8.decode(rawBody);
    body = JSON.parse(text);
  } catch {
    return errorResponse('invalid_request', 'The request body is not valid UTF-8 JSON.');
  }

  const validation = validateAiSummaryRequest(body);
  if (!validation.ok) {
    return errorResponse(validation.code, validation.message);
  }

  const input = prepareSummaryInput(validation.request);
  const outcome = await runGenerator(
    dependencies.generate,
    input,
    clientSignal,
    dependencies.timeoutMs ?? PROVIDER_TIMEOUT_MS,
  );

  // The client went away (or a newer request replaced it): never return an outdated summary.
  if ('aborted' in outcome || clientSignal.aborted) return null;

  if (outcome.ok) {
    // The fingerprint is always computed here from the validated inputs, never taken from the
    // client, and must describe the exact analysis the content was validated against.
    const fingerprint = inputFingerprint(validation.request.currency, validation.request.inputs);
    if (fingerprint !== inputFingerprint(input.analysis.currency, input.analysis.inputs)) {
      return errorResponse('internal_error');
    }
    const response: AiSummaryResponse = {
      schemaVersion: AI_SUMMARY_SCHEMA_VERSION,
      inputFingerprint: fingerprint,
      generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      modelLabel: outcome.modelLabel,
      content: outcome.content,
    };
    if (Buffer.byteLength(JSON.stringify(response)) > MAX_RESPONSE_BYTES) {
      return errorResponse('invalid_ai_response');
    }
    return { status: 200, body: response };
  }

  if (outcome.code === 'rate_limited' && outcome.retryAfterSeconds !== undefined) {
    const seconds = Math.max(0, Math.ceil(outcome.retryAfterSeconds));
    return errorResponse('rate_limited', undefined, { 'Retry-After': String(seconds) });
  }
  return errorResponse(outcome.code);
}
