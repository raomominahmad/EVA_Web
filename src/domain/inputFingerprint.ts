import type { CurrencyCode } from './currency';
import { EVA_INPUT_FIELDS } from './evaTypes';
import type { EvaInputs } from './evaTypes';

/**
 * Identifies the confirmed inputs an AI summary describes (`PROJECT_REQUIREMENTS.md` §11.5):
 * `v1:` followed by the currency and BAC, PV, EV, AC joined with `:`, each number written with
 * `String(number)`, e.g. `v1:USD:100000:40000:35000:42000`. Shared by the browser and the local
 * backend so both compute it identically. The backend never trusts a client-supplied value.
 */
export function inputFingerprint(currency: CurrencyCode, inputs: EvaInputs): string {
  return ['v1', currency, ...EVA_INPUT_FIELDS.map((field) => String(inputs[field]))].join(':');
}
