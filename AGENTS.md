# EVA — Project Instructions

## Project overview

EVA (Earned Value Analysis) is a frontend-only educational web application for performing and explaining Earned Value Management calculations. It guides a user from project details to metric entry and then to a clear, auditable analysis report.

The application must be mathematically correct, transparent about assumptions, accessible, responsive, and visually polished. All calculations, validation, and interpretations are deterministic.

The university assignment scope adds approved, planned requirements (`docs/PROJECT_REQUIREMENTS.md` §5.2): file import, a budget-versus-actual comparison, an optional AI-generated summary, and a downloadable report, following the decisions in `docs/DECISIONS.md` §8. Do not implement any requirement whose status is `Proposed` until it has been approved, which is recorded by changing its status to `Planned`. AI output must never calculate, validate, or alter inputs or metrics.

## Product workflow

1. **Project details:** collect project name and optional description, project manager, and reporting date.
2. **EVA inputs:** collect BAC, PV, EV, and AC in one clearly identified currency.
3. **Analysis report:** show the source inputs, calculated indicators, interpretations, forecast assumptions, charts, and CSV export.

Preserve entered project details when navigating between steps. Since there is no backend, use in-memory state and optionally `sessionStorage` for refresh resilience. Do not introduce authentication, a database, or server APIs unless the product scope is explicitly changed. The only approved scope change is the single AI-summary endpoint in `docs/DECISIONS.md` §8.5; AI provider keys must never appear in frontend code or `VITE_` variables.

## Technical expectations

- Use the existing project stack and conventions. Do not replace dependencies or restructure the app without a clear reason.
- Prefer small, reusable, typed components and keep calculation logic separate from presentation.
- Put all EVA calculations and validation in focused utility modules.
- Use a schema-based form validation approach if the project already uses one.
- Use semantic HTML, keyboard-accessible controls, visible focus states, and meaningful labels.
- Charts must be derived from the same calculation results shown in the report.
- Keep currency formatting consistent across inputs, metrics, charts, and exports.
- Do not hard-code example metrics into the final report.

## Calculation and validation rules

Follow `docs/EVA_FORMULAS.md` as the source of truth.

- BAC must be greater than zero.
- BAC, PV, EV, and AC must be finite, non-negative numbers.
- Under the baseline assumptions used by this application, PV and EV must not exceed BAC.
- EV is allowed to exceed PV. This can represent work completed ahead of schedule.
- AC may exceed BAC.
- PV or AC may be zero; calculations involving division by zero must display `N/A`, never `Infinity`, `-Infinity`, or `NaN`.
- Do not silently clamp, round, or alter user-entered values.
- Explain the EAC forecasting assumption in the report.

## UX and content rules

- Explain acronyms on first use or provide accessible tooltips/help text.
- Distinguish user-entered values from calculated values.
- Every metric should include its formula or a concise explanation, its value, and an interpretation where meaningful.
- Avoid presenting a ratio as a percentage unless the label and formatting make the conversion explicit.
- Do not use arbitrary red/green status alone; pair status colors with text and/or icons.
- Empty, invalid, loading, and error states should be designed rather than left to browser defaults.
- CSV export must include project metadata, input values, derived metrics, definitions/interpretations, and the reporting date when available. Escape CSV fields correctly and neutralize spreadsheet formulas in text fields (`docs/DECISIONS.md` §8.6).

## Quality gates

Before considering a feature complete:

1. Run type checking and linting if configured.
2. Run unit tests for calculation and validation logic.
3. Test all navigation paths and invalid-input states.
4. Test zero denominators and boundary values.
5. Inspect the rendered UI at desktop and mobile widths.
6. Verify CSV output with commas, quotes, and line breaks in metadata.
7. Confirm there are no `NaN` or `Infinity` strings in the UI or export.

## Working with design skills

Inspect available project skills before substantial UI work. Use relevant skills selectively:

- `frontend-design` for visual direction and implementation quality.
- `ui-ux-pro-max` for design-system and interface decisions.
- `impeccable` for focused visual refinement.
- `web-design-guidelines` for interface quality and accessibility checks.
- `agent-browser` or the available browser-testing workflow for rendered-page inspection.

Do not apply every skill mechanically. Establish one coherent design system, implement a screen, inspect the actual rendered result, then refine it.

## Scope discipline

Do not add unrelated project-management features such as task tracking, Gantt charts, resource allocation, timesheets, or AI-generated recommendations outside the planned AI summary (FR-21 to FR-24). Keep the product focused on the four EVA inputs and their analysis; file import only fills those inputs and is not a spreadsheet management feature.
