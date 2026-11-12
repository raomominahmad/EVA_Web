import type { ComponentPropsWithRef, ReactNode } from 'react';
import styles from './Button.module.css';

/**
 * `danger` is only for confirming a destructive action, always with a label that names it.
 * `onNavy` and `onNavySecondary` are the primary and secondary actions on a navy ground (the site
 * header, the landing hero, and its closing band).
 */
type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'danger' | 'onNavy' | 'onNavySecondary' | 'accent';

interface ButtonContentProps {
  variant?: ButtonVariant;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

interface ButtonProps extends ComponentPropsWithRef<'button'>, ButtonContentProps {}

/** A link that looks like a button, for navigation such as an in-page anchor. */
interface ButtonLinkProps extends ComponentPropsWithRef<'a'>, ButtonContentProps {
  href: string;
}

function buttonClasses(variant: ButtonVariant, className: string | undefined): string {
  return [styles.button, styles[variant], className].filter(Boolean).join(' ');
}

function ButtonContent({
  leadingIcon,
  trailingIcon,
  children,
}: Omit<ButtonContentProps, 'variant'> & { children: ReactNode }) {
  return (
    <>
      {leadingIcon ? (
        <span className={styles.icon} aria-hidden="true">
          {leadingIcon}
        </span>
      ) : null}
      <span>{children}</span>
      {trailingIcon ? (
        <span className={styles.icon} aria-hidden="true">
          {trailingIcon}
        </span>
      ) : null}
    </>
  );
}

export function Button({
  variant = 'primary',
  leadingIcon,
  trailingIcon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, className)} {...props}>
      <ButtonContent leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonContent>
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a className={buttonClasses(variant, className)} {...props}>
      <ButtonContent leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonContent>
    </a>
  );
}
