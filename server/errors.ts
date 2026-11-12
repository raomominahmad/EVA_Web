import type { AiSummaryErrorBody, AiSummaryErrorCode } from './contract.ts';

/** A transport-neutral response produced by the handler core or the platform adapter. */
export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
}

interface ErrorSpec {
  status: number;
  retryable: boolean;
  message: string;
}

/**
 * Status, retryability, and default user-safe message per code (`PROJECT_REQUIREMENTS.md` §11.6).
 * Messages never contain provider names, provider error text, inputs, or internal details.
 */
const ERRORS: Record<AiSummaryErrorCode, ErrorSpec> = {
  invalid_request: { status: 400, retryable: false, message: 'The request is not valid.' },
  forbidden: {
    status: 403,
    retryable: false,
    message: 'Requests are accepted only from the local EVA application.',
  },
  not_found: { status: 404, retryable: false, message: 'Not found.' },
  method_not_allowed: { status: 405, retryable: false, message: 'Only POST is supported.' },
  payload_too_large: {
    status: 413,
    retryable: false,
    message: 'The request body is larger than 2,048 bytes.',
  },
  unsupported_media: {
    status: 415,
    retryable: false,
    message: 'The request body must be JSON (Content-Type: application/json).',
  },
  invalid_inputs: {
    status: 422,
    retryable: false,
    message: 'The EVA inputs do not meet the validation rules.',
  },
  rate_limited: {
    status: 429,
    retryable: true,
    message: 'Too many requests. Try again later.',
  },
  invalid_ai_response: {
    status: 502,
    retryable: true,
    message: 'The AI summary did not pass validation. Try again.',
  },
  ai_provider_error: {
    status: 502,
    retryable: true,
    message: 'The AI service returned an error. Try again.',
  },
  ai_not_configured: {
    status: 503,
    retryable: false,
    message: 'The AI summary is not configured on this server.',
  },
  ai_unavailable: {
    status: 503,
    retryable: true,
    message: 'The AI service is unavailable. Try again later.',
  },
  ai_timeout: {
    status: 504,
    retryable: true,
    message: 'The AI service did not respond in time. Try again.',
  },
  internal_error: { status: 500, retryable: true, message: 'An unexpected error occurred.' },
};

export function errorResponse(
  code: AiSummaryErrorCode,
  message?: string,
  headers?: Readonly<Record<string, string>>,
): ApiResponse {
  const spec = ERRORS[code];
  const body: AiSummaryErrorBody = {
    error: { code, message: message ?? spec.message, retryable: spec.retryable },
  };
  return { status: spec.status, body, ...(headers ? { headers } : {}) };
}
