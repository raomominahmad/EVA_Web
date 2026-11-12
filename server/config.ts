/**
 * Backend-only configuration (`DECISIONS.md` §8.5.7, §8.5.8). Read from the process environment,
 * which `pnpm dev:api` fills from the Git-ignored `server/.env` when it exists. Errors name the
 * variable but never echo its value. The API key is kept in a `Secret`, which never prints.
 */
import { APPROVED_GROQ_MODEL } from './contract.ts';
import { Secret } from './secret.ts';

/** Approved ports (`DECISIONS.md` §8.5.10); `vite.config.ts` matches. */
export const API_PORT = 8787;
export const FRONTEND_PORT = 5173;

/** The local Vite frontend, under both loopback names a browser may use. */
export const FRONTEND_ORIGINS: readonly string[] = [
  `http://127.0.0.1:${FRONTEND_PORT}`,
  `http://localhost:${FRONTEND_PORT}`,
];

/** The only accepted `GROQ_MODEL` values. There is no fallback model. */
export const ALLOWED_GROQ_MODELS: readonly string[] = [APPROVED_GROQ_MODEL];

export interface GroqConfig {
  apiKey: Secret;
  model: string;
}

export interface BackendConfig {
  /** `null` unless both `GROQ_API_KEY` and an approved `GROQ_MODEL` are set. */
  groq: GroqConfig | null;
  /** Names of the missing variables when `groq` is `null`, for the startup message. */
  missing: string[];
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const isSet = (value: string | undefined): value is string => value !== undefined && value !== '';

export function loadConfig(env: Readonly<Record<string, string | undefined>>): BackendConfig {
  const problems: string[] = [];

  const exposed = Object.keys(env).filter(
    (name) => name.startsWith('VITE_') && /GROQ|API_KEY|SECRET|TOKEN/i.test(name),
  );
  for (const name of exposed) {
    problems.push(
      `${name}: secrets must not use the VITE_ prefix, because Vite copies VITE_ variables into the browser bundle. Remove it and use GROQ_API_KEY in server/.env.`,
    );
  }

  const key = env.GROQ_API_KEY;
  if (isSet(key) && /\s/.test(key)) {
    problems.push('GROQ_API_KEY contains whitespace. Check server/.env.');
  }

  const model = env.GROQ_MODEL;
  if (isSet(model) && !ALLOWED_GROQ_MODELS.includes(model)) {
    problems.push(
      `GROQ_MODEL is not supported. The only accepted value is ${APPROVED_GROQ_MODEL}.`,
    );
  }

  if (problems.length > 0) {
    throw new ConfigError(`Invalid backend configuration:\n- ${problems.join('\n- ')}`);
  }

  const missing = [isSet(key) ? null : 'GROQ_API_KEY', isSet(model) ? null : 'GROQ_MODEL'].filter(
    (name): name is string => name !== null,
  );
  if (!isSet(key) || !isSet(model)) return { groq: null, missing };
  return { groq: { apiKey: new Secret(key), model }, missing: [] };
}
