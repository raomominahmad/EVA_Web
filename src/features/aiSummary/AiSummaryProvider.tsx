import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useWorkflow } from '@/app/workflow/useWorkflow';
import { inputFingerprint } from '@/domain/inputFingerprint';
import { requestAiSummary } from './aiSummaryApi';
import { isAiSummaryEnabled } from './aiSummaryConfig';
import { AiSummaryContext } from './AiSummaryContext';
import type { AiSummaryContextValue, AiSummaryView } from './AiSummaryContext';

/** A state together with the confirmed analysis (by fingerprint) it belongs to. */
interface StoredView {
  fingerprint: string;
  view: AiSummaryView;
}

interface PendingRequest {
  fingerprint: string;
  controller: AbortController;
}

const IDLE: AiSummaryView = { status: 'idle' };

interface AiSummaryProviderProps {
  children: ReactNode;
  /** For tests only; defaults to the browser's `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Holds the AI summary in memory only (`UI_WORKFLOW.md` §8.2–§8.3), outside the workflow reducer
 * and outside `sessionStorage`, so a reload always discards it. Every state is tagged with the
 * fingerprint of the confirmed inputs it describes:
 *
 * - Editing the draft does not change the confirmed inputs, so the summary stays.
 * - Confirming different inputs, or a reset, changes the fingerprint: the pending request is
 *   aborted and the stored state is cleared.
 * - A response is applied only if its request is still the pending one and its fingerprint equals
 *   the one the request was sent for. Aborting is not relied on: a late response is ignored.
 */
export function AiSummaryProvider({ children, fetch: fetchImpl }: AiSummaryProviderProps) {
  const { state } = useWorkflow();
  const { confirmed } = state;
  const fingerprint = confirmed ? inputFingerprint(confirmed.currency, confirmed.inputs) : null;
  const enabled = isAiSummaryEnabled();

  const [stored, setStored] = useState<StoredView | null>(null);
  const [storedFor, setStoredFor] = useState(fingerprint);
  const pending = useRef<PendingRequest | null>(null);

  // The confirmed analysis changed (recalculated with other inputs, or reset): forget its state.
  // Adjusting state while rendering avoids ever painting the old summary for the new analysis.
  if (storedFor !== fingerprint) {
    setStoredFor(fingerprint);
    setStored(null);
  }

  // Abort the request of an analysis that is no longer shown, and on unmount.
  useEffect(() => {
    return () => {
      pending.current?.controller.abort();
      pending.current = null;
    };
  }, [fingerprint]);

  const generate = useCallback(() => {
    if (!enabled || !confirmed || fingerprint === null || pending.current) return;

    const request: PendingRequest = { fingerprint, controller: new AbortController() };
    pending.current = request;
    setStored({ fingerprint, view: { status: 'loading' } });

    void requestAiSummary(confirmed, { signal: request.controller.signal, fetch: fetchImpl }).then(
      (outcome) => {
        // Cancelled, superseded, unmounted, or the analysis changed: discard silently.
        if (pending.current !== request) return;
        pending.current = null;
        if (outcome.kind === 'aborted') return;

        let view: AiSummaryView;
        if (outcome.kind === 'failure') {
          view = { status: 'error', failure: outcome.failure };
        } else if (outcome.response.inputFingerprint !== request.fingerprint) {
          // A summary of other inputs is never shown (§11.5).
          view = { status: 'error', failure: { kind: 'invalidResponse' } };
        } else {
          view = { status: 'success', response: outcome.response };
        }
        setStored({ fingerprint: request.fingerprint, view });
      },
    );
  }, [enabled, confirmed, fingerprint, fetchImpl]);

  const cancel = useCallback(() => {
    pending.current?.controller.abort();
    pending.current = null;
    setStored(null);
  }, []);

  const view = stored !== null && stored.fingerprint === fingerprint ? stored.view : IDLE;

  const value = useMemo<AiSummaryContextValue>(
    () => ({ enabled, view: enabled ? view : IDLE, generate, cancel }),
    [enabled, view, generate, cancel],
  );

  return <AiSummaryContext.Provider value={value}>{children}</AiSummaryContext.Provider>;
}
