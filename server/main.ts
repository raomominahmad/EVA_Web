/**
 * Entry point of the local EVA backend: `pnpm dev:api` (or `pnpm dev:ai` with the frontend).
 * Listens on 127.0.0.1 only. With `GROQ_API_KEY` and the approved `GROQ_MODEL` set, valid requests
 * to `POST /api/ai-summary` are summarized by Groq; otherwise they receive `503 ai_not_configured`.
 */
import { API_PORT, ConfigError, FRONTEND_ORIGINS, loadConfig } from './config.ts';
import { AI_SUMMARY_ROUTE } from './contract.ts';
import { createProviderGenerator, notConfiguredGenerator } from './generation.ts';
import { createGroqAdapter } from './groqAdapter.ts';
import { LOOPBACK_HOST, createApiServer } from './httpServer.ts';
import { consoleRequestLogger } from './logger.ts';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const config = (() => {
  try {
    return loadConfig(process.env);
  } catch (error) {
    return fail(
      error instanceof ConfigError ? error.message : 'Could not read the backend configuration.',
    );
  }
})();

const { groq } = config;
const generate = groq
  ? createProviderGenerator(
      createGroqAdapter({ apiKey: groq.apiKey, model: groq.model }),
      groq.model,
    )
  : notConfiguredGenerator;

const server = createApiServer({
  generate,
  allowedOrigins: FRONTEND_ORIGINS,
  log: consoleRequestLogger,
});

server.on('error', (error: NodeJS.ErrnoException) => {
  fail(
    error.code === 'EADDRINUSE'
      ? `Port ${API_PORT} on ${LOOPBACK_HOST} is already in use. Stop the other process and try again.`
      : `The EVA backend could not start (${error.code ?? 'unknown error'}).`,
  );
});

server.listen(API_PORT, LOOPBACK_HOST, () => {
  console.log(`EVA backend listening on http://${LOOPBACK_HOST}:${API_PORT}${AI_SUMMARY_ROUTE}`);
  console.log(`Accepting requests from: ${FRONTEND_ORIGINS.join(', ')}`);
  console.log(
    groq
      ? `AI summary: Groq, model ${groq.model}. Each valid request makes one Groq API call.`
      : `AI summary: not configured (${config.missing.join(' and ')} not set in server/.env). Valid requests receive 503 ai_not_configured.`,
  );
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', () => {
  // Never print the reason: it could contain request data.
  console.error('Unhandled promise rejection in the EVA backend; shutting down.');
  process.exit(1);
});
