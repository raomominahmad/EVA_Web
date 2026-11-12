/**
 * Test fixtures for the backend tests (not used at run time). The content below is a valid AI
 * summary for the documented fixture (`EVA_FORMULAS.md` §8): every number in it is one of the
 * display strings the server supplies, and every assessment matches the deterministic tones.
 */
import type { AiSummaryContent } from './contract.ts';
import { prepareSummaryInput } from './handler.ts';
import type { SummaryInput } from './generation.ts';

export const FIXTURE_INPUTS = { bac: 100_000, pv: 40_000, ev: 35_000, ac: 42_000 };

export const FIXTURE_REQUEST = {
  schemaVersion: 1,
  currency: 'USD',
  inputs: FIXTURE_INPUTS,
} as const;

export function fixtureInput(inputs: Partial<typeof FIXTURE_INPUTS> = {}): SummaryInput {
  return prepareSummaryInput({
    schemaVersion: 1,
    currency: 'USD',
    inputs: { ...FIXTURE_INPUTS, ...inputs },
  });
}

export function validContent(): AiSummaryContent {
  return {
    summary:
      'Cost performance is unfavorable: CPI is 0.8333, so each unit of actual cost has earned less than one unit of budgeted value. If current cost efficiency continues, the forecast EAC of $120,000.00 is above the BAC of $100,000.00.',
    observations: [
      {
        text: 'Cost Variance is -$7,000.00: the completed work cost more than its budgeted value.',
        assessment: 'unfavorable',
        evidence: ['cv', 'cpi'],
      },
      {
        text: 'Schedule performance is also behind plan in earned-value terms, with SPI at 0.8750.',
        assessment: 'unfavorable',
        evidence: ['spi', 'sv'],
      },
      {
        text: 'Budget variance of $58,000.00 shows budget remaining, not cost efficiency; it is not Cost Variance.',
        assessment: 'neutral',
        evidence: ['budgetVariance'],
      },
    ],
    costRisks: [
      {
        text: 'If current cost efficiency continues, the project may finish $20,000.00 above the approved budget.',
        evidence: ['vac', 'eac'],
      },
    ],
    recommendations: [
      {
        text: 'Review why completed work cost more than planned, and check whether the remaining work can reach the required TCPI of 1.1207.',
        evidence: ['tcpiBac', 'cpi'],
      },
    ],
    limitations: [
      {
        text: 'SV and SPI measure progress in value terms and do not give a number of days behind schedule.',
        evidence: ['sv', 'spi'],
      },
    ],
  };
}

/** A Groq chat-completions success body carrying `content` as the message text. */
export function groqCompletion(content: string, finishReason = 'stop'): string {
  return JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    model: 'openai/gpt-oss-120b',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

/** A key-shaped test value. Never a real credential. */
export const TEST_API_KEY = 'test-only-not-a-real-credential';
