import styles from './SignedNumber.module.css';

/**
 * Renders a formatted number so a leading minus sign never wraps onto a line of its own: the sign,
 * any currency symbol, and the first digit group stay together. The text content is unchanged.
 */
export function SignedNumber({ text }: { text: string }) {
  const match = /^(-\D*\d+)(.*)$/s.exec(text);
  if (!match) return text;
  return (
    <>
      <span className={styles.keep}>{match[1]}</span>
      {match[2]}
    </>
  );
}
