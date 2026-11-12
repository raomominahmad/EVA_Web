// `pnpm dev` (also `pnpm dev:ai`): runs the Vite frontend and the local EVA backend together,
// with prefixed output. Ctrl+C stops both. If either exits, the other is stopped too, so nothing
// is left running in the background.
//
// The AI summary button is shown by default in this development setup. It is only a visibility
// flag, not a credential: the Groq key stays in `server/.env`, read by the backend alone. Set
// VITE_AI_SUMMARY_ENABLED=false to hide it. Production builds (`pnpm build`) still default to off.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const processes = [
  {
    name: 'web',
    args: ['node_modules/vite/bin/vite.js'],
    env: { VITE_AI_SUMMARY_ENABLED: process.env.VITE_AI_SUMMARY_ENABLED ?? 'true' },
  },
  {
    name: 'api',
    args: [
      '--env-file-if-exists=server/.env',
      '--import',
      './server/node-loader.mjs',
      'server/main.ts',
    ],
  },
];

const width = Math.max(...processes.map(({ name }) => name.length));
const children = [];
let exitCode = 0;
let stopping = false;

function stopAll(code) {
  if (!stopping) {
    stopping = true;
    exitCode = code;
  }
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  // Escalate if a child ignores SIGTERM, so no orphan survives.
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }, 5_000).unref();
}

for (const { name, args, env = {} } of processes) {
  const child = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
  });
  const prefix = `[${name.padEnd(width)}]`;
  for (const [stream, target] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    createInterface({ input: stream }).on('line', (line) => target.write(`${prefix} ${line}\n`));
  }
  child.on('exit', (code, signal) => {
    if (!stopping) {
      process.stderr.write(
        `${prefix} exited (${signal ?? `code ${code}`}); stopping the other process.\n`,
      );
      stopAll(code === 0 ? 0 : 1);
    }
    if (children.every((item) => item.exitCode !== null || item.signalCode !== null)) {
      process.exit(exitCode);
    }
  });
  children.push(child);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
