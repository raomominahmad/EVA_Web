# EVA — Earned Value Analysis

A frontend-only educational web application for calculating and explaining Earned Value
Management (EVM) indicators. The project details and EVA input forms, the analysis report (all
metrics with formulas and interpretations, a performance summary, assumptions, and three charts),
and the CSV report are implemented. The workflow persists to `sessionStorage`.

The university mid-term assignment adds approved requirements. Excel/CSV import, the
budget-versus-actual comparison, the cost comparison charts, and the downloadable CSV report are
**implemented**. The optional AI-generated analysis summary is **implemented** behind a build flag and needs the local backend. See
[Assignment scope](#assignment-scope).

## Status

Phase 0 establishes:

- Vite + React 19 + strict TypeScript.
- pnpm dependency management.
- ESLint flat configuration and Prettier.
- Vitest + React Testing Library.
- Playwright desktop and mobile projects.
- Global design tokens and base styles.
- The application shell and three-step workflow indicator.
- Responsive placeholder screens for project details, EVA inputs, and analysis.
- A minimal workflow reducer and typed React Context provider.
- An application error boundary and skip link.

Phase 1 adds `src/domain/`:

- `parseMonetaryInput.ts` — strict parsing of typed amounts (decimals, `1,234` grouping, maximum
  `Number.MAX_SAFE_INTEGER`, decimal places by currency, no silent rounding).
- `validateEvaInputs.ts` — field and cross-field validation with readable messages, including the
  required currency selection.
- `calculateEvaMetrics.ts` — every formula in `docs/EVA_FORMULAS.md`; undefined metrics carry an
  explicit reason.
- `explainUndefinedMetric.ts` — the explanation text shown beside `N/A` for each reason.
- `formatting.ts` and `currency.ts` — `en-US` display formatting and the supported currency list.

Phase 2 adds the workflow forms and state:

- Workflow state holds project details, the raw EVA input draft, and the confirmed inputs. The
  reducer refuses to reach EVA inputs without a valid project name, or the analysis without
  confirmed inputs.
- `workflowStorage.ts` saves that state to `sessionStorage` under `eva.workflow.v1` and validates
  it on load; malformed, wrong-version, or unavailable storage falls back to an empty workflow.
- Project details form: required project name, optional description, manager, and reporting date.
- EVA inputs form: explicit currency selection and BAC, PV, EV, AC with definitions, field-level
  errors from `validateEvaInputs`, and focus moved to the first invalid field.
- Analysis step: project overview and the confirmed input snapshot, with an empty state when no
  inputs are confirmed. Calculated indicators are not shown yet.
- Reusable `Field`, control, and `InputSnapshot` components.

Assignment report phase (FR-19, FR-20, FR-25, FR-26) adds:

- `src/domain/`: `budgetComparison.ts` (BAC − AC and its percentage of BAC), `analysis.ts` (the
  one shared result read by the report, charts, and export), `metricDefinitions.ts`, and
  `interpretations.ts` (deterministic interpretations and the CPI/SPI headline summary).
- The analysis report: performance summary, confirmed inputs, cost, schedule, forecast, and
  completion metrics, each with abbreviation, value, formula, definition, and interpretation;
  three charts; the budget-versus-actual comparison; and assumptions. If the inputs change after
  calculating, the report keeps the confirmed analysis and says so.
- `src/components/charts/`: hand-built HTML/CSS charts (budget and earned value, CPI/SPI against
  1.00, budget/actual/forecast) with text equivalents. Undefined values are never drawn as zero.
- `src/features/export/`: the CSV report (RFC 4180, CRLF, UTF-8, raw and display values) with
  spreadsheet formula injection protection. When a current AI summary exists, it is added as rows
  labelled "AI-generated summary".
- `src/features/aiSummary/`: the optional AI summary section of the report. It is shown only in
  builds with `VITE_AI_SUMMARY_ENABLED=true` and requested only when the user selects "Generate AI
  summary". It is held in memory for the confirmed analysis and never stored.

Assignment import (FR-13 to FR-18) adds `src/features/import/`:

- "Import from file" on the EVA inputs step: choose a `.csv` or `.xlsx` file, preview its rows,
  select exactly one valid row, review its values, and confirm. Only the currency and the four
  amounts fill the form; project details and any existing analysis are unchanged until
  "Calculate analysis".
- Rows are validated with the same rules as manual entry; file-level and cell-level errors are
  shown in text, linked from an error summary.
- Parsing runs in a Web Worker that is terminated after 10 seconds. `.xlsx` archives are checked
  against the size, entry, ratio, encryption, and worksheet limits before decompression.

## Requirements

- Node.js `^22.18.0 || >=23.6.0` (the local backend relies on built-in TypeScript type stripping)
- pnpm `11.25.0` (declared through `packageManager`)

## Getting started

```bash
pnpm install
pnpm dev
```

This one command starts the website and the local AI backend together. Open
`http://127.0.0.1:5173`, complete the three steps, and the analysis report ends with the
"Generate AI summary" button. Ctrl+C stops everything. Production output is generated with:

```bash
pnpm build
pnpm preview
```

### Local backend and AI summary

The AI summary uses a small local Node.js backend (`server/`) that runs next to Vite on your
computer; nothing is hosted. Both servers bind to `127.0.0.1` only.

```bash
cp server/.env.example server/.env   # once: set GROQ_API_KEY and GROQ_MODEL; ignored by Git
pnpm dev                             # Vite on 127.0.0.1:5173, backend on 127.0.0.1:8787
```

Vite proxies `/api` to the backend, so the browser stays on one origin. Ctrl+C stops both
processes. The backend accepts `POST /api/ai-summary` only from the local frontend origin and
validates and recalculates the inputs. With `GROQ_API_KEY` and `GROQ_MODEL=openai/gpt-oss-120b`
(the only accepted model) set in `server/.env`, each valid request makes one Groq call and
returns a summary only if it passes server-side validation; otherwise valid requests return
`503 ai_not_configured`. `VITE_AI_SUMMARY_ENABLED` only controls whether the report shows the
AI section; it is not a secret and not a security control. `pnpm dev` sets it to `true` unless
you set it yourself (`VITE_AI_SUMMARY_ENABLED=false pnpm dev` hides the section); production
builds still default to off. Never put a provider key in a `VITE_` variable.

## Scripts

| Command             | Purpose                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`          | Start the website and the local AI backend together, AI button shown.    |
| `pnpm dev:ai`       | Same as `pnpm dev` (kept for compatibility).                             |
| `pnpm dev:web`      | Start only the Vite development server.                                  |
| `pnpm dev:api`      | Start only the local backend on `127.0.0.1:8787`.                        |
| `pnpm build`        | Type-check the project references and build production.                  |
| `pnpm preview`      | Serve the production build locally.                                      |
| `pnpm check:build`  | Scan `dist/` for the Groq URL, key name, or key-shaped strings.          |
| `pnpm typecheck`    | Run TypeScript project-reference checks.                                 |
| `pnpm lint`         | Run ESLint across the repository.                                        |
| `pnpm lint:fix`     | Apply safe ESLint fixes.                                                 |
| `pnpm format`       | Format the repository with Prettier.                                     |
| `pnpm format:check` | Verify formatting without writing changes.                               |
| `pnpm test`         | Run unit, component, and backend tests once.                             |
| `pnpm test:watch`   | Run Vitest in watch mode.                                                |
| `pnpm test:e2e`     | Build, scan, then run all Playwright tests (default and flag-on builds). |
| `pnpm test:e2e:ai`  | Playwright tests of the AI summary on a flag-on build (mocked endpoint). |
| `pnpm verify`       | Type-check, lint, check formatting, and run unit tests.                  |

Install the Playwright Chromium browser once before running `pnpm test:e2e`:

```bash
pnpm exec playwright install chromium
```

## Project structure

```text
docs/                     Product, design, workflow, and formula documentation
e2e/                      Playwright end-to-end tests
public/                   Static assets
scripts/                  `pnpm dev:ai` orchestration and the build secret scan
server/                   Local Node.js backend for the AI summary (Groq, openai/gpt-oss-120b)
src/
  app/                    Application shell, error boundary, workflow state
  components/             Reusable UI, brand, and workflow components
  domain/                 Pure EVA parsing, validation, calculation, and formatting
  pages/                  Workflow screens
  styles/                 Design tokens and global base styles
  test/                   Vitest setup
```

## Architecture notes

- Workflow state lives in a typed reducer exposed through React Context. It holds the active
  step, project details, the raw input draft, and confirmed inputs, and is mirrored to
  `sessionStorage`. Calculated metrics are never stored; they are recalculated from the confirmed
  inputs.
- EVA logic lives in `src/domain/` as pure, framework-free TypeScript functions. Undefined
  metrics are `{ status: 'undefined', reason }` results that format as `N/A` and map to an
  explanation; formatters also guard against non-finite values.
- Styling uses plain CSS with design tokens and CSS Modules. There is no UI framework.
- `@` resolves to `src/` in TypeScript and Vite.
- TypeScript uses project references (`tsconfig.app.json`, `tsconfig.node.json`, and
  `tsconfig.server.json`) with strict indexing and optional-property checks.
- The backend imports `src/domain/` directly, so it uses exactly the report's formulas,
  validation, formatting, and interpretations. It uses only Node's built-in HTTP server.
- Frontend tests use `jsdom` through Vitest; backend tests run in the Vitest `server` project
  in a Node environment. Playwright covers desktop Chromium at 1440×900 and mobile
  Chromium at 375×812.

## Documentation

- [`AGENTS.md`](AGENTS.md) — project instructions and quality gates.
- [`docs/PROJECT_REQUIREMENTS.md`](docs/PROJECT_REQUIREMENTS.md) — scope, functional requirements
  with status (FR-01 to FR-26, FUT-01 to FUT-03), and the import file specification (§10).
- [`docs/EVA_FORMULAS.md`](docs/EVA_FORMULAS.md) — authoritative calculation contract, including
  the budget-versus-actual comparison (§10).
- [`docs/UI_WORKFLOW.md`](docs/UI_WORKFLOW.md) — screen-level interaction requirements, including
  the import and AI summary flows.
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — visual direction and accessibility guidance,
  including import, AI summary, and report components (§11).
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — approved implementation decisions (§1–7) and
  assignment-scope decisions, including the XLSX library, import safeguards, AI integration
  architecture, and CSV formula injection protection (§8).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system overview and diagram: browser frontend,
  domain layer, workflow state and `sessionStorage`, import and export, the optional local
  backend, and the Groq request lifecycle.
- [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md) — FR-01 to FR-26 mapped
  to implementation files and tests.
- [`docs/TEST_EVIDENCE.md`](docs/TEST_EVIDENCE.md) — the latest verification results.

## Remaining scope

All planned requirements are implemented. "Start a new analysis" (FR-11) on the report clears the
whole workflow after a confirmation dialog and returns to the landing page. The root URL opens
the landing page; "Create a project" starts the three-step workflow (`docs/UI_WORKFLOW.md` §0).

## Assignment scope

These requirements were approved on 2026-11-11. FR-13 to FR-26 are implemented. The AI feature
(FR-21 to FR-24) runs only locally with the backend and a flag-enabled build; nothing is hosted. Decisions are recorded in `docs/DECISIONS.md` §8.

| Assignment requirement                   | Requirements | Notes                                                                                                                           |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Manual cost data entry                   | FR-01, FR-02 | Implemented; preserved unchanged.                                                                                               |
| Excel (`.xlsx`) and CSV import           | FR-13–FR-18  | Implemented. One selected row per file; currency and four amounts only; `read-excel-file`; 1 MiB / 100 rows.                    |
| Estimated cost, actual cost, variance, % | FR-19        | Implemented. Estimated cost is BAC; BAC − AC and its % of BAC; distinct from CV and EAC.                                        |
| Cost comparison charts                   | FR-20        | Implemented. Budget comparison, CPI/SPI, and BAC/AC/EAC (EAC marked `N/A` when undefined).                                      |
| AI-powered feature                       | FR-21–FR-24  | Implemented. On-demand, in-memory AI summary via one local Node.js endpoint calling Groq (not hosted); no project details sent. |
| Downloadable report                      | FR-25, FR-26 | Implemented. CSV report with the comparison, AI rows when generated, and formula injection protection.                          |

Unusual-expense detection, PDF reports, and multi-period import are future extensions only.
