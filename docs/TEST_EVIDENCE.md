# EVA — Test Evidence

Results of the final verification run on **2026-11-12** (Phase 4.13), after the last code
changes. The requirement-to-test mapping is in `REQUIREMENTS_TRACEABILITY.md`.

## Phase 4.18 update (one dark theme)

After moving the project details, EVA inputs, report, AI summary and dialog to the landing page's
dark theme (2026-11-12): `pnpm verify` passed with **585** unit tests; the default end-to-end
suite passed **52** tests and the AI-enabled suite **8**, with both build secret scans. A browser
pass at 1440, 1024, 768 and 375 px found no axe violations (including colour contrast), no
horizontal overflow, no `NaN`/`Infinity`/`undefined` text and no console errors.

## Phase 4.17 update (dark landing and card report)

After the dark landing redesign, violet/blue chart series and card-based workflow and report
(2026-11-12): `pnpm verify` passed with **585** unit tests; the default end-to-end suite passed
**52** tests (adds the footer-link test × 2 widths) and the AI-enabled suite **8**, with its build
secret scan. A browser pass at 1440, 1024, 768 and 375 px found no axe violations, no horizontal
overflow, no `NaN`/`Infinity`/`undefined` text and no console errors. No test was removed or
relaxed; landing tests were updated to the new headline and calls to action.

## Phase 4.16 update (landing visual identity)

After the landing visual identity upgrade and the centered hero based on the reference image
(2026-11-12): `pnpm verify` passed with **584** unit
tests; `pnpm build` and `pnpm check:build` passed (18 files); the default end-to-end suite passed
**50** tests and the AI-enabled suite **8**, with its build scan. A separate browser pass at
1440×900, 1024×768, 768×1024, and 375×812 (landing page, project details, EVA inputs, and the
report) found no axe violations (WCAG 2.0, 2.1, and 2.2 A/AA tags), no horizontal overflow, no
`NaN`, `Infinity`, or `undefined` text, and no console errors. No test was removed or relaxed.

## Phase 4.15 update (landing page)

After the landing page and workflow redesign (2026-11-12): `pnpm verify` passed with **584** unit
tests (578 plus 6 landing tests); `pnpm build` and `pnpm check:build` passed (18 files); the
default end-to-end suite passed **50** tests (the 38 below plus `e2e/landing.spec.ts`, 6 tests ×
2 widths) and the AI-enabled suite **8**, both with axe and overflow checks. Specs now start from
the landing page with "Create a project"; the reset tests expect the landing page after
"Clear and start over". The rest of this document records the Phase 4.13 run.

## Environment

| Item       | Version           |
| ---------- | ----------------- |
| Node.js    | 26.13.0           |
| pnpm       | 11.25.0           |
| TypeScript | 6.0.3             |
| Vite       | 8.3.5             |
| React      | 19.3.1            |
| Vitest     | 5.0.5             |
| Playwright | 1.64.1 (Chromium) |
| ESLint     | 10.13.0           |
| Prettier   | 3.9.10            |

## Summary

| Check                        | Command                                           | Result                                                                                             |
| ---------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Type checking                | `pnpm typecheck` (`tsc -b`)                       | Passed, 0 errors                                                                                   |
| Linting                      | `pnpm lint` (ESLint, type-checked rules)          | Passed, 0 problems                                                                                 |
| Formatting                   | `pnpm format:check` (Prettier)                    | Passed, all files formatted                                                                        |
| Unit and component tests     | `pnpm test` (Vitest, `web` and `server` projects) | **578 passed** in 39 files, 0 failed                                                               |
| All of the above             | `pnpm verify`                                     | Passed                                                                                             |
| Production build             | `pnpm build`                                      | Passed                                                                                             |
| Build secret scan            | `pnpm check:build`                                | Passed: 18 files in `dist/`, no Groq URL, key name, `Authorization` header, or key-shaped string   |
| End-to-end, default build    | `pnpm test:e2e` (part 1)                          | **38 passed** (19 tests × desktop and mobile), 0 failed                                            |
| End-to-end, AI-enabled build | `pnpm test:e2e:ai` (part of `pnpm test:e2e`)      | **8 passed** (4 tests × desktop and mobile), 0 failed; secret scan of that build passed (18 files) |

For comparison, the Phase 4.12 acceptance audit recorded 558 unit tests, 38 default and 8
AI-enabled end-to-end tests, all passing. Phase 4.13 added 20 unit tests (CPI/SPI boundary
classification, tiny-ratio and large-amount display, the minus-sign rendering) and the build
secret scan.

## End-to-end coverage

Each spec runs in two Playwright projects: desktop Chromium at 1440×900 and mobile Chromium
(Pixel 5) at 375×812.

| Spec                              | Tests | Covers                                                                                                                                               |
| --------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/foundation.spec.ts`          | 7     | Shell, full workflow and back navigation, reload restore, field errors and focus, currency decimal places, skip link, overflow and axe on every step |
| `e2e/import.spec.ts`              | 3     | CSV import with confirmation, XLSX in the worker, focused file error                                                                                 |
| `e2e/report.spec.ts`              | 4     | Full report and charts, `N/A` handling, CSV download (RFC 4180, formula protection), stale-draft notice                                              |
| `e2e/reset.spec.ts`               | 4     | Confirmation dialog, Escape and Cancel, focus trap, full clear and reload                                                                            |
| `e2e/ai-summary-disabled.spec.ts` | 1     | Default build: no AI section, no AI rows, no `/api` request                                                                                          |
| `e2e/ai-summary-enabled.spec.ts`  | 4     | On-request generation with one minimal request, rendering and CSV rows, error without provider details, reset during a pending request               |

The AI-enabled tests answer `/api/ai-summary` with fixed responses and abort every other `/api`
request, so neither the local backend nor Groq is contacted.

## Accessibility

- Automated: axe-core (`@axe-core/playwright`) with the WCAG 2.0 A/AA and 2.1 A/AA rule tags runs
  inside `foundation`, `import`, `report`, `reset`, and `ai-summary-enabled` specs, at both
  widths, including error states, the import preview, the open reset dialog, and the AI loading,
  success, and error states. Result: **0 violations**.
- Horizontal overflow is checked on the same pages at both widths. Result: none.
- Keyboard behavior is tested: focus moves to the first invalid field, to `main` on a step change,
  into and back out of the import panel and the reset dialog; the dialog keeps focus inside it.
- Colour contrast is checked by axe; the danger button (white on `#B42318`) is 6.57:1.

## Calculation validation

- Unit tests: `calculateEvaMetrics.test.ts` (documented fixture from `EVA_FORMULAS.md` §8, zero
  denominators, EV = BAC, AC > BAC, maximum inputs), `budgetComparison.test.ts`,
  `interpretations.test.ts`, `formatting.test.ts`, `explainUndefinedMetric.test.ts`.
- Independent check (Phases 4.8, 4.12, and repeated in 4.13): a separate script recomputed every
  metric from the textbook formulas (for example EAC = BAC / CPI, ETC = EAC − AC) for 14 boundary
  cases and 20,000 seeded random input sets, and compared them with the application's results,
  display strings, interpretations, and CSV. Result: **0 mismatches**, and no `NaN` or `Infinity`
  in any text. This script is a one-off audit tool kept outside the repository.

## Monetary precision

- Unit tests: `parseMonetaryInput.test.ts`, `validateEvaInputs.test.ts`,
  `monetaryPrecision.test.ts` (typed text, stored session data, and the backend request agree for
  every supported currency), `interpretSheet.test.ts` (CSV and XLSX), `workflowStorage.test.ts`,
  `server/requestValidation.test.ts`, and the end-to-end decimal-places test.
- Independent check (Phases 4.12 and 4.13): 20,016 decimal strings (16 boundary values, including
  `9007199254740990.5`, and 20,000 random values) were validated for each of the 15 supported
  currencies. Every accepted value converted exactly, stayed within the currency's decimal places,
  and was also accepted by the session-storage and backend checks; every rejection had a valid
  reason. Result: **0 problems** in about 300,000 checks.

## AI provider

- Automated tests replace Groq with fixed responses (`server/*.test.ts`, the AI frontend tests, and
  the AI-enabled Playwright suite).
- One authorized live request to Groq (`openai/gpt-oss-120b`, synthetic inputs, no project
  details) was made in Phase 4.5. It passed every server-side response rule (2,624 input and 733
  output tokens; about 2.9 seconds). No other live request has been made; live behavior is
  therefore verified by that single request only.

## Manual inspection

Rendered pages were inspected at 1440×900 and 375×812 in Chromium, including the report with
realistic and extreme values, the import preview with errors, and the reset dialog. Only Chromium
was tested; other browsers were not.
