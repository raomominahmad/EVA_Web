import { Check } from 'lucide-react';
import { WORKFLOW_STEPS } from '@/app/workflow/workflowTypes';
import type { WorkflowStep } from '@/app/workflow/workflowTypes';
import styles from './Stepper.module.css';

interface StepperProps {
  currentStep: WorkflowStep;
}

type StepState = 'completed' | 'current' | 'upcoming';

function getStepState(step: WorkflowStep, currentStep: WorkflowStep): StepState {
  const currentIndex = WORKFLOW_STEPS.findIndex((item) => item.id === currentStep);
  const stepIndex = WORKFLOW_STEPS.findIndex((item) => item.id === step);

  if (stepIndex < currentIndex) {
    return 'completed';
  }

  if (stepIndex === currentIndex) {
    return 'current';
  }

  return 'upcoming';
}

function getStateLabel(state: StepState): string | null {
  switch (state) {
    case 'completed':
      return ' (completed)';

    case 'current':
      return null;

    case 'upcoming':
      return ' (upcoming)';
  }
}

export function Stepper({ currentStep }: StepperProps) {
  return (
    <nav className={styles.nav} aria-label="Workflow">
      <ol className={styles.list} aria-label="Analysis progress">
        {WORKFLOW_STEPS.map((step, index) => {
          const state = getStepState(step.id, currentStep);
          const stateLabel = getStateLabel(state);

          return (
            <li
              key={step.id}
              className={styles.item}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className={styles.marker} aria-hidden="true">
                {state === 'completed' ? <Check size={13} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className={styles.label}>
                <span className={styles.labelFull}>{step.label}</span>
                <span className={styles.labelShort}>{step.shortLabel}</span>
                {stateLabel ? <span className="visually-hidden">{stateLabel}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
