import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The first paragraph, read as the dialog's description. */
  description: ReactNode;
  /** Further detail shown below the description. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation before a destructive action, built on the native `<dialog>`: `showModal()` makes
 * the rest of the page inert, keeps keyboard focus inside the dialog, and lets Escape cancel.
 * Focus starts on the safe choice (Cancel) and, when the dialog closes, returns to the element
 * that opened it if that element is still on the page.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        returnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
        cancelRef.current?.focus();
      }
      return;
    }

    if (dialog.open) dialog.close();
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) target.focus();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      // Escape closes the native dialog; report it as a cancel while it is meant to be open.
      onClose={() => {
        if (open) onCancel();
      }}
    >
      <h2 id={`${id}-title`} className={styles.title}>
        {title}
      </h2>
      <div className={styles.body}>
        <p id={`${id}-description`}>{description}</p>
        {children}
      </div>
      <div className={styles.actions}>
        <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
