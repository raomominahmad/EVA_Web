import { EVA_INPUT_FIELDS } from '@/domain/evaTypes';
import type { EvaInputDraft } from '@/domain/evaTypes';
import { validateEvaInputs } from '@/domain/validateEvaInputs';
import type { ConfirmedInputs } from './workflowTypes';

/**
 * Whether the input draft differs from the inputs the analysis was calculated from. Formatting
 * differences that parse to the same numbers (`100,000` and `100000`) are not changes. An invalid
 * or incomplete draft is a change, because it cannot be what the analysis used.
 */
export function hasUnconfirmedChanges(draft: EvaInputDraft, confirmed: ConfirmedInputs): boolean {
  const result = validateEvaInputs(draft);
  if (!result.ok) return true;
  return (
    result.currency !== confirmed.currency ||
    EVA_INPUT_FIELDS.some((field) => result.inputs[field] !== confirmed.inputs[field])
  );
}
