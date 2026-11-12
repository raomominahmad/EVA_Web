import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Returns a form ref and a `requestFocus` callback. After a failed submission, call
 * `requestFocus()`; once the errors have rendered, focus moves to the first control in
 * document order that is marked `aria-invalid="true"`.
 */
export function useFocusFirstInvalid<Element extends HTMLElement = HTMLFormElement>() {
  const containerRef = useRef<Element>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0) {
      return;
    }

    containerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const requestFocus = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { containerRef, requestFocus } as const;
}
