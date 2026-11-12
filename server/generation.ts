/**
 * The provider-neutral boundary for AI generation (`DECISIONS.md` §8.5.1). The handler core sees
 * only `SummaryGenerator`. A provider adapter (for example Groq) returns raw text; this module
 * composes it with the prompt and the server-side response validator, so no provider output
 * reaches a client unvalidated.
 */
import type { Analysis } from '../src/domain/analysis.ts';
import type { AiSummaryContent } from './contract.ts';
import type { ModelData } from './modelData.ts';
import { validateSummaryContent } from './responseValidation.ts';
import { PROVIDER_SCHEMA, SUMMARY_SYSTEM_PROMPT, buildUserMessage } from './summaryPrompt.ts';

/** What the handler core hands to the generation layer. Derived on the server only. */
export interface SummaryInput {
  analysis: Analysis;
  modelData: ModelData;
}

/** Failure categories a generator may report; each maps to one code in §11.6. */
export type GenerationFailureCode =
  | 'ai_not_configured'
  | 'ai_unavailable'
  | 'ai_provider_error'
  | 'ai_timeout'
  | 'invalid_ai_response'
  | 'rate_limited';

export interface GenerationFailure {
  ok: false;
  code: GenerationFailureCode;
  /** Seconds to wait before retrying, when the provider stated it (`rate_limited` only). */
  retryAfterSeconds?: number;
}

/** Content that has passed every rule of `PROJECT_REQUIREMENTS.md` §11.4. */
export interface GenerationSuccess {
  ok: true;
  content: AiSummaryContent;
  modelLabel: string;
}

export type GenerationResult = GenerationSuccess | GenerationFailure;

/** The generation layer. Must honor `signal`; the handler also enforces its own deadline. */
export type SummaryGenerator = (
  input: SummaryInput,
  signal: AbortSignal,
) => Promise<GenerationResult>;

/** What a provider adapter receives: the instruction, the data message, and the output schema. */
export interface ProviderRequest {
  system: string;
  data: string;
  schema: Readonly<Record<string, unknown>>;
}

/** Raw, untrusted provider text, or a mapped failure. Never contains provider error text. */
export type ProviderResult = { ok: true; text: string } | GenerationFailure;

/** A provider adapter (Groq). It never parses or trusts the text it returns. */
export interface AiProviderAdapter {
  generate(request: ProviderRequest, signal: AbortSignal): Promise<ProviderResult>;
}

/** The generation layer while no provider is configured: always `503 ai_not_configured`. */
export const notConfiguredGenerator: SummaryGenerator = () =>
  Promise.resolve({ ok: false, code: 'ai_not_configured' });

/**
 * Composes a provider adapter with the prompt and the response validator. One provider call per
 * request, no retry. Output that fails validation is rejected, never repaired.
 */
export function createProviderGenerator(
  adapter: AiProviderAdapter,
  modelLabel: string,
): SummaryGenerator {
  return async (input, signal) => {
    const result = await adapter.generate(
      {
        system: SUMMARY_SYSTEM_PROMPT,
        data: buildUserMessage(input.modelData),
        schema: PROVIDER_SCHEMA,
      },
      signal,
    );
    if (!result.ok) return result;

    const validation = validateSummaryContent(result.text, input.modelData);
    if (!validation.ok) return { ok: false, code: 'invalid_ai_response' };
    return { ok: true, content: validation.content, modelLabel };
  };
}
