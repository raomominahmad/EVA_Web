import { createContext } from 'react';
import type { AiSummaryFailure, AiSummaryResponse } from './aiSummaryApi';

/** The AI summary state of the analysis currently shown (`UI_WORKFLOW.md` §8.2). */
export type AiSummaryView =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; response: AiSummaryResponse }
  | { status: 'error'; failure: AiSummaryFailure };

export interface AiSummaryContextValue {
  /** Whether this build offers the AI summary at all. */
  enabled: boolean;
  view: AiSummaryView;
  /** Starts one request for the confirmed inputs. Ignored while a request is pending. */
  generate: () => void;
  /** Aborts the pending request and returns to the idle state. */
  cancel: () => void;
}

export const AiSummaryContext = createContext<AiSummaryContextValue | null>(null);
