/**
 * Groq provider adapter (`DECISIONS.md` §8.5.5). One chat-completions call per request with
 * Node's built-in `fetch`, strict structured output, no streaming, no tools, and no retry. It
 * returns the raw message text or a mapped failure code. It never logs anything, and never
 * forwards Groq's error text or response body.
 */
import type { AiProviderAdapter, GenerationFailure, ProviderResult } from './generation.ts';
import type { Secret } from './secret.ts';

export const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Request settings. `reasoning_effort: "low"` keeps latency and token use down;
 * `include_reasoning: false` stops the model's reasoning text from being returned at all.
 * `max_completion_tokens` is an estimate that must leave room for reasoning and the JSON answer
 * (§8.5.13); the temperature is low for consistent wording. These values were used unchanged in
 * the one authorized live request (Phase 4.5: 733 completion tokens, 156 of them reasoning, and a
 * valid summary). They have not been tuned further.
 */
export const GROQ_REQUEST_SETTINGS = {
  max_completion_tokens: 2048,
  temperature: 0.2,
  reasoning_effort: 'low',
  include_reasoning: false,
  stream: false,
} as const;

/** Provider responses are small; anything far larger is treated as malformed. */
const MAX_PROVIDER_RESPONSE_CHARS = 256 * 1024;
/** The message Groq documents for a best-effort JSON Schema mismatch (HTTP 400). */
const SCHEMA_MISMATCH = 'does not match the expected schema';

export interface GroqAdapterOptions {
  apiKey: Secret;
  model: string;
  /** Injected in tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

const fail = (code: GenerationFailure['code'], retryAfterSeconds?: number): GenerationFailure =>
  retryAfterSeconds === undefined ? { ok: false, code } : { ok: false, code, retryAfterSeconds };

/** `retry-after` in seconds, as Groq sends it on 429. Anything else is ignored. */
function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || !/^\d+(?:\.\d+)?$/.test(header.trim())) return undefined;
  return Number(header);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Maps a non-200 status to a failure code (`DECISIONS.md` §8.5.5 table). */
function mapErrorStatus(
  status: number,
  body: string,
  retryAfter: string | null,
): GenerationFailure {
  if (status === 401 || status === 403) return fail('ai_not_configured');
  if (status === 429) return fail('rate_limited', parseRetryAfter(retryAfter));
  if (status === 498 || status === 503) return fail('ai_unavailable');
  if (status === 422) return fail('invalid_ai_response');
  if (status === 400 && body.includes(SCHEMA_MISMATCH)) return fail('invalid_ai_response');
  // 400 blocked_api_access (spend limit), other 4xx, 500, 502, and other 5xx.
  return fail('ai_provider_error');
}

/** Extracts the message text of a complete answer from a 200 response body. */
function parseCompletion(body: string): ProviderResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return fail('ai_provider_error');
  }
  const choice: unknown =
    isRecord(parsed) && Array.isArray(parsed.choices) ? parsed.choices[0] : undefined;
  if (!isRecord(choice) || !isRecord(choice.message)) return fail('ai_provider_error');

  // Anything but a natural stop (e.g. "length") means the JSON may be cut off.
  if (choice.finish_reason !== 'stop') return fail('invalid_ai_response');
  const { content } = choice.message;
  if (typeof content !== 'string' || content.trim() === '') return fail('invalid_ai_response');
  return { ok: true, text: content };
}

export function createGroqAdapter(options: GroqAdapterOptions): AiProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async generate(request, signal) {
      const body = JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.data },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'eva_ai_summary', strict: true, schema: request.schema },
        },
        ...GROQ_REQUEST_SETTINGS,
      });

      let response: Response;
      let text: string;
      try {
        response = await fetchImpl(GROQ_CHAT_COMPLETIONS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey.reveal()}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body,
          signal,
          redirect: 'error',
        });
        text = await response.text();
      } catch {
        // The error object is discarded: it may describe the request.
        return fail(signal.aborted ? 'ai_timeout' : 'ai_unavailable');
      }

      if (text.length > MAX_PROVIDER_RESPONSE_CHARS) return fail('ai_provider_error');
      if (response.status !== 200) {
        return mapErrorStatus(response.status, text, response.headers.get('retry-after'));
      }
      return parseCompletion(text);
    },
  };
}
