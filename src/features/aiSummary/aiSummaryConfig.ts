/**
 * Whether this build offers the AI summary (`DECISIONS.md` §8.5.8). A public visibility flag, not
 * a security control: it holds no credential, and the local backend decides on its own whether it
 * is configured. Read on every call so tests can switch it.
 */
export function isAiSummaryEnabled(): boolean {
  return import.meta.env.VITE_AI_SUMMARY_ENABLED === 'true';
}
