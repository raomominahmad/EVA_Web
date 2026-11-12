import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Browser tests of the AI summary with the feature enabled (`docs/DECISIONS.md` §8.5.8). A
 * separate build with `VITE_AI_SUMMARY_ENABLED=true` is written outside `dist/` and served on its
 * own port, so the default build and the default flag (off) are unchanged. Every
 * `/api/ai-summary` request is answered by Playwright; neither the local backend nor Groq is used.
 */
const PORT = 4174;
const OUT_DIR = 'node_modules/.tmp/e2e-ai-dist';

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: ['ai-summary-enabled.spec.ts'],
  outputDir: 'test-results/ai',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/ai' }]],
  use: { ...baseConfig.use, baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `pnpm exec vite build --outDir ${OUT_DIR} --emptyOutDir && pnpm exec vite preview --outDir ${OUT_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    env: { VITE_AI_SUMMARY_ENABLED: 'true' },
    // Always build fresh, so a stale or flag-off server is never reused.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
