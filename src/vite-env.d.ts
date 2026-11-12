/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `"true"` shows the AI summary action (`docs/DECISIONS.md` §8.5.8). Never a secret. */
  readonly VITE_AI_SUMMARY_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
