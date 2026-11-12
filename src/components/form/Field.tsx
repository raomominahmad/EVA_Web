import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Field.module.css';

/** Accessibility attributes that associate a control with its label, hint, and error. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode | undefined;
  error?: string | undefined;
  optional?: boolean;
  className?: string | undefined;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Lays out a visible label, optional hint, control, and error message, and wires the control's
 * `aria-describedby` and `aria-invalid` attributes.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional = false,
  className,
  children,
}: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  const control: FieldControlProps = { id };

  if (describedBy) {
    control['aria-describedby'] = describedBy;
  }

  if (error) {
    control['aria-invalid'] = true;
  }

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional ? <span className={styles.optional}>Optional</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {children(control)}
      {error ? (
        <p id={errorId} className={styles.error}>
          <CircleAlert className={styles.errorIcon} size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            <span className="visually-hidden">Error: </span>
            {error}
          </span>
        </p>
      ) : null}
    </div>
  );
}
