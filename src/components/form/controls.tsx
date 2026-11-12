import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import styles from './controls.module.css';

function classes(...names: (string | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

export function TextInput({
  className,
  type = 'text',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={classes(styles.control, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classes(styles.control, styles.textarea, className)} {...props} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className={styles.selectWrap}>
      <select className={classes(styles.control, styles.select, className)} {...props}>
        {children}
      </select>
    </div>
  );
}

interface AffixInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Short unit shown inside the field, e.g. a currency code. Hidden from assistive tech. */
  prefix?: string | undefined;
}

/** A text input with a visual unit prefix. The unit must also be stated in the label or hint. */
export function AffixInput({ className, prefix, type = 'text', ...props }: AffixInputProps) {
  return (
    <div className={styles.affix}>
      {prefix ? (
        <span className={styles.prefix} aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      <input
        type={type}
        className={classes(styles.control, styles.affixControl, 'numeric', className)}
        {...props}
      />
    </div>
  );
}
