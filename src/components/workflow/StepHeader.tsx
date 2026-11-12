import { FolderOpen } from 'lucide-react';
import styles from './StepHeader.module.css';

interface StepHeaderProps {
  title: string;
  lead: string;
  /** Name of the project being analysed, shown under the lead for context. */
  projectName?: string | undefined;
}

export function StepHeader({ title, lead, projectName }: StepHeaderProps) {
  return (
    <div className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lead}>{lead}</p>
      {projectName ? (
        <p className={styles.context}>
          <FolderOpen className={styles.contextIcon} size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            <span className={styles.contextLabel}>Project: </span>
            <span className={styles.contextValue}>{projectName}</span>
          </span>
        </p>
      ) : null}
    </div>
  );
}
