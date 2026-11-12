# EVA — UI Workflow Specification

## 0. Landing page

The root URL opens a landing page before the workflow (Phase 4.15, requested for the assignment
demonstration). It is a view, not a workflow step: it is not in the reducer, not counted by the
progress indicator, and never stored.

- **When it is shown:** in a new tab with nothing saved, after a reload before anything was
  entered, and after a confirmed "Start a new analysis". A reload with work in progress reopens
  the saved step, as before (FR-10).
- **Header:** sticky glass bar with the EVA identity, in-page links (Features, How it works,
  About) and a primary "Create a project" button. No workflow progress is shown.
- **Hero (Phase 4.17, dark):** the badge "Earned Value Analysis made simple", the heading
  "Understand project performance. Make smarter decisions.", one supporting sentence, "Create a
  project" (primary) and "Explore sample report" (link to the preview), and a note that no account
  is needed and entries stay in the tab. Below, a "Sample report preview" labelled "Sample data —
  Illustrative analysis": the worked example from `EVA_FORMULAS.md` §8 (inputs, CPI, SPI, CV, SV,
  EAC, budget variance and the forecast chart), calculated by the same engine and formatting
  functions as the report.
- **Features:** eight cards for the real capabilities, with exact formulas read from
  `metricDefinitions.ts`. No testimonials, logos, user counts, or invented features.
- **How it works:** four numbered steps: enter project details; provide BAC, PV, EV and AC;
  generate the analysis; review and download.
- **AI summary:** EVA calculates every value; the optional AI only explains them (observations,
  risks, recommendations, limitations) and receives only the currency and the four values.
- **Closing call to action** ("Create your first analysis") and the footer with "About EVA".
- Every "Create a project" action opens empty project details with focus on the main content.

## 1. Global shell

Use a consistent application shell across all workflow steps:

- Compact brand/header area with EVA identity.
- Main content container with consistent width and alignment.
- Three-step progress indicator.
- Footer or low-emphasis supporting note if useful.

Avoid unnecessary navigation links because this is a focused, single-purpose workflow.

## 2. Screen 1 — Project details

### Goal

Establish which project the analysis describes before asking for numerical values.

### Content hierarchy

1. EVA brand / product identity.
2. Main heading explaining the task.
3. Short sentence describing the workflow.
4. Project details form.
5. Primary Continue action.

### Fields

- Project name (required).
- Project description (optional, multiline).
- Project manager (optional).
- Reporting date (optional; use a date input).

### Interaction

- Continue validates project name.
- Show a concise inline error if project name is blank.
- Preserve optional fields and project name when navigating.
- Do not make the form feel like a long administrative questionnaire.

## 3. Screen 2 — EVA inputs

### Goal

Collect the four values required for Earned Value Analysis.

### Content hierarchy

1. Step title and short explanation.
2. Currency selector or clear currency declaration.
3. Four input fields, each with acronym, full name, definition, and example formatting if useful.
4. A compact reminder that all amounts must use the same currency.
5. Back and Calculate / View analysis actions.

### Field guidance

- BAC: total approved project budget.
- PV: budgeted value of work planned by the reporting date.
- EV: budgeted value of work actually completed by the reporting date.
- AC: actual cost incurred for the work completed by the reporting date.

### Validation feedback

Show errors beside the relevant fields. Explain that PV and EV cannot exceed BAC under the app's baseline assumptions. Do not reject EV > PV or AC > BAC.

### Interaction

- Back returns to project details without clearing data.
- Calculate validates all fields.
- On success, calculate metrics and navigate to the report.
- On failure, focus or otherwise direct attention to the first invalid field.

### Import from file

Status: implemented (`PROJECT_REQUIREMENTS.md` FR-13 to FR-18; file format and resource limits in §10 of that document).

Import is an optional shortcut for filling this form. It does not add a workflow step, does not change the step indicator, and never navigates on its own.

1. **Select.** A secondary "Import from file" action opens an import panel on the EVA inputs step. The panel states the accepted types (`.csv`, `.xlsx`), the 1 MiB (1,048,576-byte) limit, and the expected columns with a one-row example. The user selects a file with a native file control; drag and drop may be offered as an addition, never as the only method.
2. **Check the file.** The application checks extension, content type, and size, and for `.xlsx` the archive safeguards, before reading. A rejected file shows a file-level error in the panel and nothing else changes.
3. **Read.** The file is parsed locally (`.xlsx` with `read-excel-file`). A short reading state is shown; a parse failure, an exceeded resource limit, or a parse taking longer than 10 seconds shows a file-level error.
4. **Preview.** The panel shows the file name, worksheet name, recognised and ignored columns, and a table of data rows with spreadsheet row numbers and values exactly as read.
5. **Validate.** Each row is validated with the manual-entry rules. File-level errors appear above the table. Cell errors are marked in the table and listed in an error summary as "Row N, Column: message". Rows with errors cannot be selected.
6. **Confirm.** The user must select exactly one valid row (preselected when it is the only one) and chooses "Use these values". The panel closes, the form fields show the imported values, focus moves to the first form field, and a status message confirms which row was imported. "Cancel" closes the panel without changing anything.

Only the currency and the four amounts are imported; project details stay on the project details step. After import, the values can be edited like typed values, and the user still chooses "Calculate analysis". Import never changes project details or the confirmed inputs of an existing analysis, and the file itself is not kept.

## 4. Screen 3 — Analysis report

### Goal

Help the user understand current cost/schedule performance and the implications of the forecast.

### Recommended content order

1. **Report header:** project name, reporting date, manager if available, edit inputs, export CSV.
   Since Phase 4.20 the project details (reporting date, manager, currency) are one quiet line
   under the page title rather than a card, and a sticky "Report sections" bar of in-page links
   (Summary, Inputs, Cost, Schedule, Forecast, Completion, Charts, Budget, AI summary when
   enabled, Assumptions) stays in reach while reading and marks the section in view.
2. **Executive summary:** concise deterministic overview of cost and schedule performance. Do not claim certainty.
3. **Input snapshot:** BAC, PV, EV, AC, clearly identified as user-entered data.
4. **Performance overview:** CV, SV, CPI, SPI.
5. **Forecast:** EAC, ETC, VAC, TCPI against BAC, TCPI against EAC.
6. **Progress context:** planned completion, earned completion, budget utilization.
7. **Visual analysis:** selected charts with labels and text equivalents.
8. **Budget versus actual (FR-19):** estimated cost (BAC, the approved budget, not EAC), actual cost (AC), budget variance, and percentage variance, with a note that this is not Cost Variance (`EVA_FORMULAS.md` §10.4).
9. **Interpretation:** explain what the metrics mean in context.
10. **AI-generated summary (FR-21 to FR-24):** optional and clearly labelled; see §8.
11. **Assumptions and limitations:** explicitly describe the EAC assumption and limitations of interpreting schedule variance/index. When the budget comparison is shown, state that it does not account for work completed.
12. **Actions:** edit this analysis or start a new analysis.

Items 1–9, 11, and 12 are implemented in this order (the performance overview is split into cost and schedule sections, and per-metric interpretations appear with each metric). Item 10 (AI summary) is implemented and appears only when the build enables it (§8). The "Start a new analysis" action (FR-11) is described in §5. Items 8 and 10 come from the assignment scope.

### Executive summary logic

Use deterministic rules:

- Summarize cost using CPI when it is defined. If CPI is undefined, label cost efficiency `Not assessable`; still show CV and explain it separately. Do not infer headline performance from CV alone.
- Summarize schedule using SPI when it is defined. If SPI is undefined, label schedule efficiency `Not assessable`; still show SV and explain it separately. Do not infer headline performance from SV alone.
- If a metric is undefined, explain why it cannot be calculated from the supplied values.
- Do not infer calendar days ahead/behind from SV or SPI.
- Avoid generic recommendations that are not supported by the inputs.

### Visualization guidance

Implemented (`src/components/charts/`):

1. **Budget comparison (cost comparison):** PV, EV, AC, and BAC on one zero-based monetary scale.
2. **Performance indices:** CPI and SPI against a reference line at 1.00. An undefined index is shown as `N/A` with its explanation, not as a bar.
3. **Budget, actual, and forecast (cost comparison):** BAC, AC, and EAC. When EAC is undefined, BAC and AC are still plotted and EAC is marked `N/A` with its explanation, never plotted as zero.

Charts 1 and 3 are the two cost comparison charts required by the assignment (FR-20). Both render for every valid set of confirmed inputs. Adding AC to chart 3 is the only change to the original plan, and it is approved; it keeps a budget-versus-actual comparison visible when EAC is undefined (`DECISIONS.md` §8.4).

All charts read the shared analysis result, the same object the report and export use, and never recalculate metrics. Each chart has a title, axis labels, and an equivalent data table or text description.

Do not create charts merely to fill space. If the chart would duplicate a clear metric, prefer the metric and interpretation.

## 5. Navigation and state

- The user can move backward from step 2 to step 1 without losing data.
- The user can edit inputs from the report.
- While an analysis exists, the EVA inputs step offers "View last analysis", which returns to the report without recalculating. If the input draft then differs from the confirmed inputs (an invalid draft counts as different; `100,000` and `100000` do not), the report shows a notice that it uses the previously confirmed inputs, with a "Review inputs and recalculate" action. The report, charts, and export never read draft values.
- Starting a new analysis clears previous data only after a clear user action. It also clears any AI summary.
- **Start a new analysis (FR-11):** a secondary button with a reset icon in the report's final action bar, opposite "Edit EVA inputs". It opens a modal confirmation dialog ("Start a new analysis?") that lists what is discarded: the project details, the currency and the four amounts, the report and its charts, and, when the AI summary is enabled, any summary (a summary still being generated is cancelled). It says the saved copy for the tab is removed, that this cannot be undone, and that the CSV can be downloaded first.
  - Focus starts on "Cancel". "Cancel", Escape, or closing the dialog changes nothing and returns focus to "Start a new analysis". Clicking the backdrop does nothing.
  - "Clear and start over" restores the initial workflow state (empty project details, an empty input draft with no currency, no confirmed inputs, and the project details step) and shows the landing page (§0), with focus on the main content. "Create a project" then opens the empty project details. The `sessionStorage` entry is overwritten with that empty state, so a reload does not bring anything back. Import state belongs to the EVA inputs step and is not kept.
  - The AI summary state is discarded because the confirmed inputs disappear: a pending request is aborted, and its late response is ignored even if the same inputs are confirmed again (§8.3).
- Importing a file changes only the EVA input draft on the current step (see Screen 2).
- Keep state in the application. Use `sessionStorage` with a versioned key to preserve drafts and confirmed inputs for refresh resilience, and recompute the analysis from confirmed inputs rather than persisting derived results as the source of truth. Imported files and AI summaries are never persisted.
- Do not persist sensitive project data to external services.

## 6. CSV export

The export should be a useful report dataset, not a screenshot or an unstructured text dump.

Suggested columns:

- Section
- Metric
- Symbol
- Value
- Unit
- Formula / definition
- Interpretation

Include project metadata and reporting date. Include raw numeric values in a machine-readable form where possible, while also including formatted display values if useful. Correctly escape commas, quotes, and line breaks. Use a clear filename based on the project name and reporting date, sanitized for filesystem compatibility.

The CSV export is the downloadable analysis report (FR-25). Rows are grouped by the Section column in this order:

1. Project: name, description, manager, reporting date (or "Not provided"), currency.
2. Inputs: BAC, PV, EV, AC, identified as user-entered.
3. Performance, Forecast, Progress: the EVA metrics with formulas and interpretations; undefined values exported as `N/A` with the explanation.
4. Budget versus actual: estimated cost, actual cost, budget variance, percentage variance, and the note that it differs from CV.
5. Assumptions: the EAC assumption and the stated limitations.
6. AI-generated summary (only when one for the current confirmed inputs is in memory): each part labelled AI-generated, with the generation time and model identifier.

Every text field is protected against spreadsheet formula injection before escaping (FR-26, `DECISIONS.md` §8.6); raw numeric values are never altered.

PDF output is not provided (`PROJECT_REQUIREMENTS.md` FUT-02).

## 7. Empty and error states

- No project details: guide the user to start at step 1.
- Missing input: show a field-level message.
- Undefined metric: display `N/A` with an explanation.
- Unexpected calculation failure: show a recoverable error and preserve inputs.
- No reporting date: omit it or label it as not provided; do not invent one.
- Import: rejected file, file over a resource limit, unreadable file, file with no valid rows, and file with some invalid rows each have a designed message in the import panel; the form stays unchanged until confirmation.
- AI summary: not requested, generating, generated, timed out, failed, and not configured each have a designed state; see §8.

## 8. AI-generated summary

Status: designed (Phase 4), **implemented** (backend Phase 4.4, frontend Phase 4.6; `PROJECT_REQUIREMENTS.md` FR-21 to FR-24). The API contract is in `PROJECT_REQUIREMENTS.md` §11; architecture, prompt, and security in `DECISIONS.md` §8.5. The provider is Groq, called only by a local Node.js backend that runs on the user's computer next to the Vite frontend; the browser calls the same-origin path `/api/ai-summary`, which the Vite development proxy forwards to that backend. Nothing is hosted. The backend answers `503 ai_not_configured` until `GROQ_API_KEY` and `GROQ_MODEL` are set. The frontend (`src/features/aiSummary/`) implements this section; the section is shown only in builds with `VITE_AI_SUMMARY_ENABLED=true`. The state lives in `AiSummaryProvider`, mounted inside the workflow provider. Confirming the same inputs again keeps the summary, because its fingerprint is unchanged; confirming different inputs or resetting discards it.

### 8.1 Placement and content

- The section "AI-generated summary" appears after the deterministic report sections and before "Assumptions and limitations", only when the build enables the feature (`DECISIONS.md` §8.5.8). The deterministic executive summary (§4) is never replaced by AI text.
- Before the first request, a note lists what is sent (the currency and the four confirmed inputs; the local backend derives the metrics and sends them to Groq) and what is not (project name, description, manager, reporting date).
- A generated summary shows five labelled parts: Summary, Observations, Cost risks, Recommendations, and Limitations (empty parts are omitted). Each observation shows its assessment as text and icon (Favorable, Unfavorable, Neutral, Not assessable).
- Below the generated content, outside its frame, a fixed note "How to read the AI text" (marked "Written by EVA, not generated by the AI") states the limits of the AI reading: it sees only the four confirmed values at one reporting date and the results calculated from them, it cannot know causes, its recommendations are starting points to investigate, its forecasts assume the current cost efficiency continues, and the calculated values are authoritative.
- Each item lists its evidence as chips such as "CPI 0.8333" or "EAC N/A". The chip values come from the browser's own deterministic analysis, never from the AI response, so facts and interpretation stay visibly separate.
- A note under the heading: "Generated by an AI model from the calculated results above. It may be incomplete or wrong; the calculated values are authoritative." The generation time and model label are shown.

### 8.2 States

The summary state is held in memory in a context above the analysis page, outside the workflow reducer and outside `sessionStorage`. Each state carries the input fingerprint it belongs to (`PROJECT_REQUIREMENTS.md` §11.5).

| State          | Shown                                                                                                                                                                                                                                                                                                                                     | Actions                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Not requested  | Data note and the action "Generate AI summary".                                                                                                                                                                                                                                                                                           | Generate                 |
| Loading        | "Generating the AI summary…" in a polite live region. The rest of the report, the export, and navigation stay usable. The action is disabled.                                                                                                                                                                                             | Cancel                   |
| Success        | The five parts, evidence chips, generation time, and model label.                                                                                                                                                                                                                                                                         | Regenerate               |
| Error          | A short message by error code: rate limited ("Too many requests. Try again in N seconds."), unavailable, invalid AI response, or other. A request that cannot reach the local backend (not started, or the proxy answers without the JSON error schema) is shown as unavailable: "The AI service is not running. Start it and try again." | Try again (if retryable) |
| Timed out      | "The AI summary took too long (30 seconds). The report above is complete without it."                                                                                                                                                                                                                                                     | Try again                |
| Not configured | No section at all when the build does not enable the feature; the browser cannot know in advance whether the backend is configured, so a `503 ai_not_configured` at run time removes the action and shows a one-line note for the analysis shown.                                                                                         | None                     |

- Only an explicit action starts a request. Nothing is requested automatically, on navigation, or on reload, and there are no automatic retries.
- Failure states never hide or alter the deterministic report or block the CSV export.
- Cancel aborts the request and returns to Not requested.

### 8.3 Stale requests and input changes

- A request is sent for the **confirmed** inputs, with its fingerprint and a request id kept in memory.
- **Editing the draft** while a request is loading does not cancel it: the report still shows the confirmed analysis, and the summary describes that analysis. The stale-input notice (§5) applies to the summary as well.
- **When the confirmed inputs change** (the user recalculates), any loading request is aborted, any summary is discarded, and the section returns to Not requested.
- A response is displayed only if its request id is the latest one sent **and** its `inputFingerprint` equals the fingerprint of the analysis currently shown. Otherwise it is discarded silently. A response for outdated inputs is never shown.
- Leaving the analysis step and returning keeps a summary (or a loading request) whose fingerprint still matches. A reload or a reset discards it.

### 8.4 Export

- As approved (FR-25), the CSV includes the "AI-generated summary" rows only when a successful summary whose fingerprint matches the current confirmed inputs is in memory. Rows carry the generation time and model label, and every text field is protected against formula injection (FR-26).
- Loading, failed, timed-out, or stale summaries are never exported. The summary itself is never persisted; exporting writes it only into the downloaded file.

### 8.5 Rendering rules

- AI text is rendered as plain text only, never as HTML or Markdown.
- Values shown next to AI text come from the deterministic analysis, never from AI output.
