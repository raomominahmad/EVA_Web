import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import styles from './StepActions.module.css';

interface StepActionsProps {
  onBack?: () => void;
  onContinue?: () => void;
  backLabel?: string;
  continueLabel?: string;
  /** Render the primary action as the submit button of the enclosing form. */
  submit?: boolean;
  /** A different action in the place of the primary one, for a step with no next step. */
  endAction?: ReactNode;
}

export function StepActions({
  onBack,
  onContinue,
  backLabel = 'Back',
  continueLabel = 'Continue',
  submit = false,
  endAction,
}: StepActionsProps) {
  const showContinue = submit || onContinue !== undefined;

  return (
    <div className={styles.actions}>
      {onBack ? (
        <Button
          variant="ghost"
          leadingIcon={<ArrowLeft size={16} strokeWidth={2} />}
          onClick={onBack}
        >
          {backLabel}
        </Button>
      ) : null}
      {showContinue ? (
        <div className={styles.primaryAction}>
          <Button
            type={submit ? 'submit' : 'button'}
            trailingIcon={<ArrowRight size={16} strokeWidth={2} />}
            onClick={onContinue}
          >
            {continueLabel}
          </Button>
        </div>
      ) : endAction ? (
        <div className={styles.primaryAction}>{endAction}</div>
      ) : null}
    </div>
  );
}
