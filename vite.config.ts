import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Local backend for the AI summary (`docs/DECISIONS.md` §8.5.8). Must match `server/config.ts`.
const API_ORIGIN = 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    // Loopback only, on a fixed port: the backend accepts requests only from this origin.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // Same-origin `/api` for the browser. `changeOrigin` sets the Host header to the backend's
      // own address, which the backend requires; the browser's Origin header is passed through.
      '/api': { target: API_ORIGIN, changeOrigin: true },
    },
  },
  // ES-module workers allow the import worker to code-split `read-excel-file`, so it loads only
  // when an .xlsx file is processed.
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          css: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts'],
        },
      },
    ],
  },
});
