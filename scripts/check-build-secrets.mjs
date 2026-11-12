// `pnpm check:build`: scans built frontend output for anything that belongs only to the local
// backend (DECISIONS.md §8.5): the Groq API URL, the key variable name, an Authorization header,
// or a Groq-key-shaped string. It never reads server/.env and never prints a matched value, only
// the file and the kind of match. Exits 1 if anything is found or a directory is missing.
//
// Usage: node scripts/check-build-secrets.mjs [dir ...]   (default: dist)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const CHECKS = [
  { name: 'Groq API URL', pattern: /api\.groq\.com/ },
  { name: 'GROQ_API_KEY variable name', pattern: /GROQ_API_KEY/ },
  { name: 'Authorization header', pattern: /Authorization["']?\s*:/ },
  { name: 'Groq-key-shaped string', pattern: /gsk_[A-Za-z0-9]{20,}/ },
];

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (entry.isFile()) yield full;
  }
}

const dirs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['dist'];
let problems = 0;
let scanned = 0;

for (const dir of dirs) {
  try {
    for await (const file of files(dir)) {
      scanned += 1;
      const text = (await readFile(file)).toString('latin1');
      for (const { name, pattern } of CHECKS) {
        if (pattern.test(text)) {
          problems += 1;
          console.error(`Found ${name} in ${file}`);
        }
      }
    }
  } catch {
    problems += 1;
    console.error(`Cannot read ${dir}. Build it first (pnpm build).`);
  }
}

if (problems > 0) {
  console.error(`Build secret check failed: ${problems} problem(s).`);
  process.exit(1);
}
console.log(`Build secret check passed: ${scanned} file(s) in ${dirs.join(', ')}.`);
