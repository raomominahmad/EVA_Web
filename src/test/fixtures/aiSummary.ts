// Imported from the contract itself so the Playwright tests (outside `src/`) can share it.
import type { AiSummaryResponse } from '../../../server/contract.ts';

/** The fingerprint of the report fixture: USD, BAC 100000, PV 40000, EV 35000, AC 42000. */
export const FIXTURE_FINGERPRINT = 'v1:USD:100000:40000:35000:42000';

/** A valid response for the report fixture, as the backend would return it (mocked; no AI call). */
export function aiSummaryResponse(overrides: Partial<AiSummaryResponse> = {}): AiSummaryResponse {
  return {
    schemaVersion: 1,
    inputFingerprint: FIXTURE_FINGERPRINT,
    generatedAt: '2026-11-11T10:15:00.000Z',
    modelLabel: 'openai/gpt-oss-120b',
    content: {
      summary: 'Cost performance is unfavorable: CPI is 0.8333 for the completed work.',
      observations: [
        {
          text: 'The completed work cost more than its budgeted value.',
          assessment: 'unfavorable',
          evidence: ['cv', 'cpi'],
        },
        {
          text: 'Budget remaining does not measure cost efficiency.',
          assessment: 'neutral',
          evidence: ['budgetVariance'],
        },
      ],
      costRisks: [
        {
          text: 'If cost efficiency does not improve, the project may exceed BAC.',
          evidence: ['eac'],
        },
      ],
      recommendations: [{ text: 'Review the cost drivers of completed work.', evidence: ['ac'] }],
      limitations: [
        {
          text: 'Planned completion is shown in value terms only.',
          evidence: ['plannedCompletion'],
        },
      ],
    },
    ...overrides,
  };
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function errorResponse(
  status: number,
  code: string,
  retryable: boolean,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(status, { error: { code, message: 'Server message.', retryable } }, headers);
}
