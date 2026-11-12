import type { AiSummaryErrorCode } from './contract.ts';

/**
 * The only fields ever logged per request (`DECISIONS.md` §8.5.7). There is deliberately no
 * field for headers, bodies, inputs, prompts, AI output, or keys.
 */
export interface RequestLogEntry {
  requestId: string;
  time: string;
  /** `null` when the client disconnected before a response was sent. */
  status: number | null;
  code?: AiSummaryErrorCode;
  durationMs: number;
}

export type RequestLogger = (entry: RequestLogEntry) => void;

export const consoleRequestLogger: RequestLogger = (entry) => {
  console.log(JSON.stringify(entry));
};
