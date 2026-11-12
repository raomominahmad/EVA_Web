/**
 * HTTP contract of `POST /api/ai-summary` (`docs/PROJECT_REQUIREMENTS.md` §11). Types only, plus
 * the fixed limits; no behavior.
 */
import type { CurrencyCode } from '../src/domain/currency.ts';
import type { EvaInputs } from '../src/domain/evaTypes.ts';

export const AI_SUMMARY_ROUTE = '/api/ai-summary';
export const AI_SUMMARY_SCHEMA_VERSION = 1;
/** Maximum request body (§11.2). A valid request is under 200 bytes. */
export const MAX_REQUEST_BYTES = 2048;
/** Deadline for the AI-generation layer (§11.7); the browser gives up after 30 s. */
export const PROVIDER_TIMEOUT_MS = 25_000;

/** §11.2. The schema is closed: no other property is accepted. */
export interface AiSummaryRequest {
  schemaVersion: typeof AI_SUMMARY_SCHEMA_VERSION;
  currency: CurrencyCode;
  inputs: EvaInputs;
}

/** §11.6. `forbidden` and `not_found` are returned by the local platform adapter only. */
export type AiSummaryErrorCode =
  | 'invalid_request'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'unsupported_media'
  | 'invalid_inputs'
  | 'rate_limited'
  | 'invalid_ai_response'
  | 'ai_provider_error'
  | 'ai_not_configured'
  | 'ai_unavailable'
  | 'ai_timeout'
  | 'internal_error';

export interface AiSummaryErrorBody {
  error: {
    code: AiSummaryErrorCode;
    message: string;
    /** Whether the same request may succeed if tried again later. */
    retryable: boolean;
  };
}

/** §11.3. Keys an AI statement may cite as evidence; values always come from the analysis. */
export const EVIDENCE_KEYS = [
  'bac',
  'pv',
  'ev',
  'ac',
  'cv',
  'sv',
  'cpi',
  'spi',
  'eac',
  'etc',
  'vac',
  'tcpiBac',
  'tcpiEac',
  'plannedCompletion',
  'earnedCompletion',
  'budgetUtilization',
  'budgetVariance',
  'budgetVariancePercent',
] as const;

export type EvidenceKey = (typeof EVIDENCE_KEYS)[number];

/** §11.3. `notAssessable` is only for observations that reference an undefined metric. */
export const ASSESSMENTS = ['favorable', 'unfavorable', 'neutral', 'notAssessable'] as const;

export type Assessment = (typeof ASSESSMENTS)[number];

export interface AiSummaryObservation {
  text: string;
  assessment: Assessment;
  evidence: EvidenceKey[];
}

export interface AiSummaryItem {
  text: string;
  evidence: EvidenceKey[];
}

/** §11.3. The model produces only this; the server adds every other response field. */
export interface AiSummaryContent {
  summary: string;
  observations: AiSummaryObservation[];
  costRisks: AiSummaryItem[];
  recommendations: AiSummaryItem[];
  limitations: AiSummaryItem[];
}

export interface AiSummaryResponse {
  schemaVersion: typeof AI_SUMMARY_SCHEMA_VERSION;
  inputFingerprint: string;
  generatedAt: string;
  modelLabel: string;
  content: AiSummaryContent;
}

/** §11.3 count and length limits, enforced by the server whatever the provider guarantees. */
export const CONTENT_LIMITS = {
  summaryLength: { min: 1, max: 600 },
  textLength: { min: 1, max: 400 },
  evidence: { min: 1, max: 4 },
  observations: { min: 1, max: 6 },
  costRisks: { min: 0, max: 4 },
  recommendations: { min: 0, max: 4 },
  limitations: { min: 0, max: 4 },
} as const;

/** §11.3. Maximum size of a serialized success response. */
export const MAX_RESPONSE_BYTES = 16 * 1024;

/** The only model this backend accepts (`DECISIONS.md` §8.5.13). */
export const APPROVED_GROQ_MODEL = 'openai/gpt-oss-120b';
