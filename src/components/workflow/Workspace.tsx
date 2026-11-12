import type { ReactNode } from 'react';
import styles from './Workspace.module.css';

interface WorkspaceProps {
  children: ReactNode;
  /** Supporting context shown beside the form on wide screens and after it on narrow ones. */
  aside: ReactNode;
  asideLabel: string;
}

export function Workspace({ children, aside, asideLabel }: WorkspaceProps) {
  return (
    <div className={styles.workspace}>
      <div className={styles.primary}>{children}</div>
      <aside className={styles.aside} aria-label={asideLabel}>
        {aside}
      </aside>
    </div>
  );
}

/** A titled group inside the workspace aside. */
export function AsideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.asideSection} aria-labelledby={id}>
      <h2 id={id} className={styles.asideTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}
