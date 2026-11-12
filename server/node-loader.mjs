// Lets Node run the backend's TypeScript directly, with no build step and no extra dependency.
// Node strips the types itself; this hook only resolves the extensionless relative imports used
// in `src/domain/` (written for Vite) to their `.ts` files.
import module from 'node:module';

if (typeof module.registerHooks !== 'function' || !process.features.typescript) {
  console.error(
    'The EVA backend needs Node.js ^22.18.0 or >=23.6.0 (built-in TypeScript type stripping and module.registerHooks).',
  );
  process.exit(1);
}

const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      RELATIVE.test(specifier) &&
      !HAS_EXTENSION.test(specifier) &&
      context.parentURL?.endsWith('.ts')
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
