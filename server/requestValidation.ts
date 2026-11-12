import { isSupportedCurrency } from '../src/domain/currency.ts';
import { EVA_INPUT_FIELDS } from '../src/domain/evaTypes.ts';
import { isValidEvaInputValues } from '../src/domain/validateEvaInputs.ts';
import { AI_SUMMARY_SCHEMA_VERSION } from './contract.ts';
import type { AiSummaryRequest } from './contract.ts';

export type RequestValidationResult =
  | { ok: true; request: AiSummaryRequest }
  | { ok: false; code: 'invalid_request' | 'invalid_inputs'; message: string };

const REQUEST_KEYS = ['schemaVersion', 'currency', 'inputs'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Exactly the expected own keys: none missing, none extra (including `__proto__`). */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function invalidRequest(message: string): RequestValidationResult {
  return { ok: false, code: 'invalid_request', message };
}

/**
 * Validates a parsed JSON body against `PROJECT_REQUIREMENTS.md` §11.2: first the closed schema
 * (`400 invalid_request`), then the EVA input rules (`422 invalid_inputs`) through the same
 * domain check the application uses for confirmed inputs. Values are never coerced or clamped.
 */
export function validateAiSummaryRequest(body: unknown): RequestValidationResult {
  if (!isPlainObject(body)) {
    return invalidRequest('The request body must be a JSON object.');
  }
  if (!hasExactKeys(body, REQUEST_KEYS)) {
    return invalidRequest(
      'The request must contain exactly the properties schemaVersion, currency, and inputs.',
    );
  }

  const { schemaVersion, currency, inputs } = body;

  if (schemaVersion !== AI_SUMMARY_SCHEMA_VERSION) {
    return invalidRequest('Unsupported schemaVersion. The supported version is 1.');
  }
  if (typeof currency !== 'string' || !isSupportedCurrency(currency)) {
    return invalidRequest('currency must be one of the supported currency codes.');
  }
  if (!isPlainObject(inputs) || !hasExactKeys(inputs, EVA_INPUT_FIELDS)) {
    return invalidRequest('inputs must contain exactly the properties bac, pv, ev, and ac.');
  }
  for (const field of EVA_INPUT_FIELDS) {
    if (typeof inputs[field] !== 'number') {
      return invalidRequest(`inputs.${field} must be a number.`);
    }
  }

  const values = { bac: inputs.bac, pv: inputs.pv, ev: inputs.ev, ac: inputs.ac };
  if (!isValidEvaInputValues(values, currency)) {
    return {
      ok: false,
      code: 'invalid_inputs',
      message:
        "The inputs must be finite, non-negative amounts within the currency's decimal places and exact precision, with BAC greater than zero and PV and EV not above BAC.",
    };
  }

  return {
    ok: true,
    request: { schemaVersion: AI_SUMMARY_SCHEMA_VERSION, currency, inputs: values },
  };
}
