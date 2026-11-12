# EVA — Project Requirements

## 1. Purpose

EVA (Earned Value Analysis) is a frontend-only web application that helps a user calculate and understand core Earned Value Management (EVM) indicators for a software project at a chosen reporting date.

The application should make the calculations transparent and understandable to a student or project manager. It must not imply that forecasts are guaranteed outcomes.

The university mid-term assignment adds further web application requirements: spreadsheet import, a budget-versus-actual comparison, cost comparison charts, an AI-generated analysis summary, and a downloadable analysis report. They are specified in §5.2 and §10. They were approved on 2026-11-11; their implementation status is listed per requirement in §5.2.

### 1.1 Requirement status

Every functional requirement carries one of these statuses:

| Status      | Meaning                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented | Built and covered by automated tests in the current codebase.                                                                                  |
| Partial     | Part of the requirement is implemented; the remainder is planned as noted.                                                                     |
| Planned     | Approved and scheduled, not implemented. No requirement currently has this status; assignment items follow the decisions in `DECISIONS.md` §8. |
| Proposed    | Documented but awaiting approval. No requirement currently has this status.                                                                    |
| Future      | A possible extension. Not part of the current or assignment scope; no implementation is planned.                                               |

A new requirement starts as `Proposed`; approval is recorded by changing its status to `Planned`.

## 2. Target user and primary job

**Primary user:** a student or project manager who has a project's baseline and current performance figures.

**Primary job:** enter project information and four EVM values, then receive a structured analysis that explains cost and schedule performance and provides a forecast based on clearly stated assumptions.

## 3. Scope

### In scope

- Project metadata entry.
- Entry and validation of BAC, PV, EV, and AC.
- Calculation of core EVM metrics.
- Plain-language interpretations.
- Forecast metrics and their assumptions.
- Useful charts or visual summaries.
- CSV export of inputs and analysis.
- Responsive, accessible user interface.
- Client-side persistence across the workflow.

Assignment scope (§5.2). Import, the budget-versus-actual comparison, the cost comparison charts, the CSV report, and the optional AI summary are implemented:

- Import of EVA input values from `.csv` and `.xlsx` files, with preview, validation, and confirmation.
- Budget-versus-actual comparison (estimated cost, actual cost, budget variance, percentage variance).
- At least two cost comparison charts.
- An optional, clearly labelled AI-generated cost analysis summary, served through a single secure endpoint on a local Node.js backend that calls the Groq API (`DECISIONS.md` §8.5).
- A downloadable analysis report (CSV) that includes the comparison and, when available, the AI summary, with spreadsheet formula injection protection.

### Out of scope

- User accounts and authentication.
- Backend services or database. The only approved exception is the single AI-summary endpoint in `DECISIONS.md` §8.5, which stores nothing.
- Team collaboration or multi-user access.
- Automatic integrations with Jira, GitHub, or project-management tools.
- AI-generated analysis other than the AI summary (FR-21 to FR-24). AI must never calculate, validate, or alter metrics.
- Task scheduling, resource planning, timesheets, or Gantt charts.
- Financial advice or claims that forecasts are certain.
- Spreadsheet management: editing imported files, multi-sheet selection, column mapping editors, merging several rows, or multi-period (time-series) analysis.
- Legacy or other spreadsheet formats (`.xls`, `.xlsm`, `.ods`, `.numbers`) and PDF report generation.

## 4. User journey

### Step 1 — Project details

Required:

- Project name.

Optional:

- Project description.
- Project manager.
- Reporting date.

Actions:

- Continue to EVA inputs.
- Show clear validation if the required project name is missing.
- Preserve metadata when navigating backward or forward.

### Step 2 — EVA inputs

Required numeric fields:

- **BAC — Budget at Completion:** total approved budget for the project.
- **PV — Planned Value:** budgeted value of work scheduled to be completed by the reporting date.
- **EV — Earned Value:** budgeted value of work actually completed by the reporting date.
- **AC — Actual Cost:** actual cost incurred for the completed work by the reporting date.

Requirements:

- Show a short definition and unit/currency context for each field.
- All four values use the same currency.
- Provide an explicit currency selector or clearly identify the chosen currency. Do not infer a currency from the user's locale.
- Accept decimal values where appropriate.
- Validate on submission and provide field-level messages.
- Allow EV to be greater than PV.
- Allow AC to be greater than BAC.
- Permit PV or AC to be zero, with undefined ratios handled as `N/A`.
- BAC must be greater than zero.
- Provide a way to return to project details without losing entered values.
- _Implemented:_ optionally import the currency and the four values from a `.csv` or `.xlsx` file instead of typing them (FR-13 to FR-18). Manual entry remains the default and is unchanged.

### Step 3 — Analysis report

Show:

1. Project name and available metadata.
2. Reporting date, if supplied.
3. A concise overall summary.
4. The four original input values.
5. Core indicators: CV, SV, CPI, and SPI.
6. Forecast indicators: EAC, ETC, VAC, and TCPI variants where mathematically defined.
7. Completion and budget-use ratios where mathematically defined.
8. Plain-language interpretations.
9. Charts that reinforce, rather than replace, the numerical results.
10. A clear note describing assumptions and limitations.
11. CSV export.
12. An action to edit inputs or start a new analysis.
13. A budget-versus-actual comparison (FR-19).
14. An optional AI-generated summary, separated from the calculated results, shown only when the build enables it (FR-21 to FR-24).

## 5. Functional requirements

### 5.1 Core requirements (v1)

| ID    | Requirement              | Acceptance criteria                                                                                                   | Status                                    |
| ----- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR-01 | Capture project details  | User can enter a project name and optional metadata; missing project name is rejected with a clear message.           | Implemented                               |
| FR-02 | Capture EVA inputs       | User can enter BAC, PV, EV, and AC, with definitions and a consistent currency.                                       | Implemented                               |
| FR-03 | Validate inputs          | Invalid, negative, non-finite, and out-of-range baseline values are rejected according to `EVA_FORMULAS.md`.          | Implemented                               |
| FR-04 | Calculate metrics        | All defined metrics are calculated using the formulas in `EVA_FORMULAS.md`.                                           | Implemented                               |
| FR-05 | Handle undefined metrics | Zero denominators produce `N/A`, not `NaN` or infinity.                                                               | Implemented                               |
| FR-06 | Explain performance      | The report provides deterministic, understandable interpretations of cost and schedule indicators.                    | Implemented                               |
| FR-07 | Present forecasts        | Forecasts state the assumptions under which they are calculated and do not imply certainty.                           | Implemented                               |
| FR-08 | Visualize results        | Charts use the same source calculation results as the report and have accessible labels or equivalent tabular values. | Implemented (amended by FR-20)            |
| FR-09 | Export report data       | CSV contains metadata, inputs, metrics, definitions/interpretations, and reporting date where available.              | Implemented (extended by FR-25 and FR-26) |
| FR-10 | Preserve workflow state  | User can navigate backward and forward without losing entered data; refresh resilience may use `sessionStorage`.      | Implemented                               |
| FR-11 | Reset analysis           | User can start a new analysis after an appropriate confirmation or clearly explained reset action.                    | Implemented                               |
| FR-12 | Responsive interface     | All workflow steps remain usable on narrow mobile screens and desktop screens.                                        | Implemented                               |

### 5.2 Assignment requirements

These requirements come from the university mid-term assignment. They extend, and never replace, the core requirements, `EVA_FORMULAS.md`, and the existing validation rules. The import file format is specified in §10, the comparison formulas in `EVA_FORMULAS.md` §10, and the architecture in `DECISIONS.md` §8.

#### File import (assignment requirement B)

| ID    | Requirement                 | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Status      |
| ----- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-13 | Offer file import           | The EVA inputs step offers an "Import from file" action alongside the manual form. Manual entry (FR-01, FR-02) remains the default, keeps its current fields and validation, and works without importing anything.                                                                                                                                                                                                                                                            | Implemented |
| FR-14 | Validate file type and size | Only `.csv` and `.xlsx` files of 1 to 1,048,576 bytes (1 MiB) are accepted, checked by extension and file content. `.xlsx` files must also pass the archive safeguards in §10.1 before parsing. Any other file, including `.xls`, `.xlsm`, and `.ods`, and any empty (0-byte) or oversized file is rejected before parsing, with a message that names the accepted types and limit.                                                                                           | Implemented |
| FR-15 | Parse files locally         | Accepted files are parsed in the browser according to §10. File contents are never uploaded, stored, or persisted; only values the user confirms (FR-18) enter the workflow state. A file that cannot be parsed (for example, a corrupt workbook or an unterminated CSV quote), exceeds a resource limit in §10.1, or takes longer than the parse time limit produces a file-level error and no preview. `.xlsx` files are read with `read-excel-file` (`DECISIONS.md` §8.2). | Implemented |
| FR-16 | Preview imported data       | Before anything is applied, the user sees the file name, the worksheet name (for `.xlsx`), the recognised and ignored columns, and every data row with its spreadsheet row number, its values exactly as read from the file, and a row status (valid or the number of errors).                                                                                                                                                                                                | Implemented |
| FR-17 | Validate imported values    | Each data row is validated with the same rules as manual entry (`EVA_FORMULAS.md` §5, `DECISIONS.md` §3). Missing columns, duplicate columns, too many columns, no data rows, and more than 100 data rows are file-level errors. Blank, malformed, non-numeric, exponential, negative, too-large, and out-of-range values are cell-level errors that name the row number, the column, and the rule. Blank values are never treated as zero.                                   | Implemented |
| FR-18 | Confirm before applying     | The user must select exactly one row without errors, and nothing changes until the user confirms. Confirming replaces the four EVA input draft values and, when the row provides one, the currency. Nothing else is imported: project details and confirmed inputs are unchanged. Cancelling leaves the form exactly as it was. The user still chooses "Calculate analysis" to confirm the values.                                                                            | Implemented |

#### Calculations, charts, AI, and report (assignment requirements C–F)

| ID    | Requirement                           | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status      |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-19 | Budget-versus-actual comparison       | The report shows estimated cost (BAC, the approved budget; not EAC), actual cost (AC), budget variance (BAC − AC), and percentage variance (((BAC − AC) / BAC) × 100), calculated automatically according to `EVA_FORMULAS.md` §10. The section states that this comparison is not EVA Cost Variance (CV = EV − AC) and never labels budget variance as CV.                                                                                                                                                                                                                 | Implemented |
| FR-20 | Cost comparison charts                | The report provides the three planned charts (`UI_WORKFLOW.md` §4): budget comparison, CPI/SPI against 1.00, and budget, actual, and forecast. At least two of them, the budget comparison and the budget/actual/forecast chart, are cost comparisons and render for every valid set of confirmed inputs; when EAC is undefined, the third chart still plots BAC and AC and marks EAC as `N/A` with its explanation. Charts read the shared analysis result and never recalculate metrics.                                                                                  | Implemented |
| FR-21 | AI cost analysis summary              | On explicit user request, the report shows an AI-generated summary of the confirmed results in plain language, structured as in §11.3: an overall summary, evidence-based observations (including unfavorable indicators), cost risks, recommendations, and limitations where a metric cannot be assessed. Each statement references the deterministic facts it relies on.                                                                                                                                                                                                  | Implemented |
| FR-22 | Separate AI output from facts         | The AI summary is visually and textually labelled "AI-generated" and is separate from the calculated results and deterministic interpretations. It is generated only from confirmed results, never changes inputs or results, contains no numeric fields, never states a value for an undefined metric (enforced by server-side validation, §11.4), and is held in memory only: it is never written to `sessionStorage` or `localStorage` and is discarded when the confirmed inputs change, the analysis is reset, or the page reloads. The report is complete without it. | Implemented |
| FR-23 | Protect AI data and credentials       | The user is told which data will be sent before the first request. The browser sends only the currency and the four confirmed inputs; the local backend derives the metrics and sends Groq only those values (§11.1). The project name, description, manager, and reporting date are never sent. The Groq API key exists only in the local backend's own Git-ignored environment file: no API key or provider URL appears in the frontend source, build output, or `VITE_`-prefixed variables.                                                                              | Implemented |
| FR-24 | Handle AI unavailability              | Not-requested, loading, success, error, timed-out (30 seconds), and not-configured states are designed (§11.6, §11.7, `UI_WORKFLOW.md` §8). A failure shows a recoverable message with a retry action and never blocks or alters the rest of the report or the export. The browser cannot know in advance whether the local backend is configured: the action is offered, and the first `503 ai_not_configured` response replaces it with a one-line note and no action for the analysis shown.                                                                             | Implemented |
| FR-25 | Downloadable analysis report          | The CSV export (FR-09) contains project information, reporting date (or "Not provided"), currency, confirmed inputs, EVA results, the budget-versus-actual comparison, definitions and interpretations, the forecast assumptions, and, when generated, the AI summary labelled as AI-generated. It follows RFC 4180 and includes full-precision raw values.                                                                                                                                                                                                                 | Implemented |
| FR-26 | Prevent spreadsheet formula injection | Every exported text field whose first character, or first non-whitespace character, is `=`, `+`, `-`, `@` (or a full-width variant), or whose first character is a tab or carriage return, is prefixed with an apostrophe before RFC 4180 escaping, as specified in `DECISIONS.md` §8.6. Numeric fields (raw input and calculated values) are never altered. Unit tests cover every trigger, the exemptions, and the sanitize-then-escape order.                                                                                                                            | Implemented |

#### Future extensions

| ID     | Extension                 | Notes                                                                                                                     | Status |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| FUT-01 | Unusual-expense detection | Would require itemized expense data, which the four-value EVA model does not collect. Not a mandatory assignment feature. | Future |
| FUT-02 | PDF report                | The CSV export satisfies the downloadable-report requirement; PDF generation would add dependencies and layout work.      | Future |
| FUT-03 | Multi-period import       | Importing several reporting periods as a trend would turn import into spreadsheet management (see §3 out of scope).       | Future |

## 6. Non-functional requirements

- **Correctness:** formulas and validation follow `EVA_FORMULAS.md`.
- **Transparency:** show formulas or definitions and disclose forecast assumptions.
- **Usability:** minimize jargon and explain necessary EVM terms.
- **Accessibility:** semantic structure, keyboard operation, focus visibility, sufficient contrast, and labels for form controls.
- **Performance:** calculations run locally and should feel immediate for normal use.
- **Privacy:** project information remains in the browser; do not transmit it to a server. _Exception:_ when the user explicitly requests the AI summary, only the minimized payload in `DECISIONS.md` §8.5 is sent; project name, description, manager, and reporting date are not sent.
- **Security:** the Groq API key is held only by the local backend, which listens on `127.0.0.1` only and checks the request origin (`DECISIONS.md` §8.5.7). Imported files are treated as untrusted input: they are size- and resource-limited (§10.1), parsed without executing macros or formulas, and rendered as text only. Exported CSV text is protected against formula injection (FR-26, implemented).
- **Maintainability:** separate domain calculations, validation, formatting, and UI components.
- **Reliability:** undefined calculations and invalid data must be handled explicitly. The deterministic report, charts, and export must work fully when the AI endpoint is unavailable.

## 7. Business rules

- One analysis represents one project at one reporting date.
- All monetary values must use the same currency.
- BAC must be positive.
- PV and EV cannot exceed BAC under the application's baseline assumptions.
- EV may exceed PV.
- AC may exceed BAC.
- Zero PV or AC is permitted, but dependent ratios are undefined.
- No forecast should be presented without its underlying assumption.
- Display formatting must not change the underlying numeric values used in calculations.
- Imported values are subject to exactly the same rules as typed values; an invalid record is never accepted, partially applied, or silently corrected.
- Budget variance compares total budget with spending to date. It does not measure cost efficiency; CV and CPI do (see `EVA_FORMULAS.md` §10).
- AI output is advisory text. It is never a source of numbers for the report, charts, or export calculations.

## 8. Suggested report structure

- Project overview.
- Performance-at-a-glance.
- Input values.
- Cost performance.
- Schedule performance.
- Forecast and completion indicators.
- Interpretation and recommended areas to investigate.
- Budget versus actual.
- AI-generated summary (optional, labelled).
- Assumptions and limitations.
- Export controls.

## 9. Definition of done

A release is ready when all functional requirements are implemented, formula and validation tests pass, the workflow works at desktop and mobile widths, CSV output is verified, and no undefined numeric result is rendered as `NaN` or infinity.

For the assignment scope, a release additionally requires:

- Import tests with valid `.csv` and `.xlsx` fixtures and with each error case in §10.6, including empty, oversized, unsupported, and malformed files.
- Tests for each `.xlsx` safeguard in §10.1 (entry count, uncompressed size, compression ratio, worksheet count, encrypted entries, parse time limit) and for the CSV column and cell limits.
- Budget-versus-actual tests with the fixtures in `EVA_FORMULAS.md` §10.
- CSV export tests for formula injection protection (FR-26), alongside the existing comma, quote, and line-break escaping checks.
- AI summary tests against a mocked endpoint, covering success, timeout, error, and not-configured states. No automated test calls a live AI provider.
- A check that the production build contains no AI credentials.

## 10. Import file specification

This section is the contract for FR-13 to FR-18, which are implemented in `src/features/import/`.

### 10.1 Accepted files

- Extensions: `.csv` and `.xlsx` (case-insensitive). Content must match the extension: an `.xlsx` file must be a ZIP-based Office Open XML workbook, and a `.csv` file must be text.
- Size: 1 to 1,048,576 bytes.
- CSV: UTF-8 (a leading byte-order mark is ignored), comma delimiter, RFC 4180 quoting, CRLF or LF line endings. Values that contain commas, such as `100,000`, must be quoted.
- XLSX: only the first worksheet in workbook order is read; the preview names it. Formulas are never evaluated: a formula cell uses its stored calculated value, and a formula without one is a cell error. Macros, links, and embedded objects are ignored. Parsing uses `read-excel-file`.

#### Resource safeguards

Checked before any content is shown. Each breach is a file-level error.

| Safeguard                                | Limit                                      | Applies to |
| ---------------------------------------- | ------------------------------------------ | ---------- |
| File size                                | 1 to 1,048,576 bytes                       | Both       |
| Archive entries                          | At most 200                                | `.xlsx`    |
| Declared uncompressed size, per entry    | At most 10 MiB                             | `.xlsx`    |
| Declared uncompressed size, total        | At most 20 MiB                             | `.xlsx`    |
| Compression ratio, per entry over 64 KiB | At most 200 : 1                            | `.xlsx`    |
| Encrypted or ZIP64 entries               | Not allowed                                | `.xlsx`    |
| Worksheets in the workbook               | At most 50 (only the first is read)        | `.xlsx`    |
| Parse time                               | 10 seconds, then parsing is abandoned      | Both       |
| Columns in any row                       | At most 50                                 | Both       |
| Data rows                                | At most 100 (empty rows are not counted)   | Both       |
| Characters in a recognised cell          | At most 100; longer values are cell errors | Both       |

The archive checks read only the ZIP index, before decompression. Because an archive can declare false sizes, the parse time limit and the post-parse column, row, and cell checks remain in force. Values in ignored columns are neither displayed nor retained.

### 10.2 Layout

- The first non-empty row is the header row. Every following non-empty row is one data record: the values for one project at one reporting date.
- At least 1 and at most 100 data rows. Completely empty rows are skipped and do not count.
- Row numbers in messages are the row numbers shown in a spreadsheet application (1-based, counting the header row and skipped rows).

Example:

```csv
Currency,BAC,PV,EV,AC
USD,"100,000",40000,35000,42000.50
```

### 10.3 Columns

Header names are matched case-insensitively after trimming whitespace. Either the symbol or the full name is accepted.

| Column   | Accepted headers              | Required | Value                                                            |
| -------- | ----------------------------- | -------- | ---------------------------------------------------------------- |
| BAC      | `BAC`, `Budget at Completion` | Yes      | Monetary amount                                                  |
| PV       | `PV`, `Planned Value`         | Yes      | Monetary amount                                                  |
| EV       | `EV`, `Earned Value`          | Yes      | Monetary amount                                                  |
| AC       | `AC`, `Actual Cost`           | Yes      | Monetary amount                                                  |
| Currency | `Currency`                    | No       | A supported ISO 4217 code, e.g. `USD`; blank means not specified |

- Other columns are ignored and listed as ignored in the preview.
- Two columns that map to the same field are a file-level error.
- Project details (name, manager, description, reporting date) are not imported.

### 10.4 Cell values

- Text cells, and every CSV value, are parsed with the same rules as typed input (`DECISIONS.md` §3): plain or correctly grouped decimals only; no currency symbols, exponential notation, negative values, or text.
- Numeric `.xlsx` cells must be finite, non-negative, and no larger than `Number.MAX_SAFE_INTEGER`, and must satisfy the same precision rule as typed input (`DECISIONS.md` §3). A stored value with more decimal places than the currency allows (for example a formula result of `0.30000000000000004`) is a cell error and is never rounded; round it in the spreadsheet.
- The currency's decimal-place limit is checked per row when the row has a currency. When it has none, the check runs in the form against the selected currency when the analysis is calculated.
- Blank cells, error cells (for example `#DIV/0!`), boolean cells, and date cells in a monetary column are cell errors.
- Cross-field rules apply per row: BAC > 0, PV ≤ BAC, EV ≤ BAC. EV > PV, AC > BAC, PV = 0, and AC = 0 are valid.
- A currency must be a supported code. When the row has no currency, the currency already selected in the form is kept, and the existing rule that a currency must be selected before calculating still applies.

### 10.5 Applying a row

- A row with errors cannot be selected. Exactly one valid row must be selected before the import can be confirmed; when the file has exactly one valid row, it is preselected.
- Only the currency and the four monetary inputs are applied. Project details are never imported.
- On confirmation, each amount is written to the input draft as text that re-parses to exactly the same number: CSV and text-cell values are written as read (trimmed), and numeric cells as a plain decimal without grouping or exponent.
- After applying, the form shows the imported values and the normal "Calculate analysis" flow continues.

### 10.6 Error cases

| Case                                           | Level | Example message                                                                                         |
| ---------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| Unsupported extension or content               | File  | "This file type is not supported. Choose a .csv or .xlsx file."                                         |
| Empty file (0 bytes)                           | File  | "This file is empty."                                                                                   |
| File larger than 1 MiB                         | File  | "This file is larger than 1 MiB (1,048,576 bytes). Import files must be 1 MiB or smaller."              |
| Unreadable workbook or malformed CSV           | File  | "The file could not be read. Line 4 has an unclosed quotation mark."                                    |
| No header row or no data rows                  | File  | "The file has no data rows below the header."                                                           |
| More than 100 data rows                        | File  | "The file has 140 data rows. Import files can contain at most 100."                                     |
| Resource safeguard exceeded (§10.1)            | File  | "This workbook is too large or complex to import safely. Save only the EVA values in a new file."       |
| Parse time limit exceeded                      | File  | "Reading this file took too long. Save only the EVA values in a new file and try again."                |
| More than 50 columns                           | File  | "The file has 64 columns. Import files can contain at most 50."                                         |
| Recognised cell over 100 characters            | Cell  | "Row 3, BAC: the value is too long to be an amount."                                                    |
| Required column missing                        | File  | "Required columns are missing: EV, AC."                                                                 |
| Duplicate column                               | File  | "Two columns map to PV: “PV” and “Planned Value”."                                                      |
| Blank, malformed, negative, or too-large value | Cell  | "Row 3, AC: AC cannot be negative."                                                                     |
| Cross-field rule broken                        | Cell  | "Row 5, PV: PV cannot exceed BAC under this application's baseline assumptions."                        |
| Unsupported currency                           | Cell  | "Row 2, Currency: “US$” is not a supported currency code."                                              |
| Formula without a stored value                 | Cell  | "Row 4, BAC: the formula has no calculated value. Open and save the file in a spreadsheet application." |
| Row with more cells than the header (CSV)      | Row   | "Row 6 has more values than there are columns."                                                         |

## 11. AI summary API contract

Status: implemented (backend Phase 4.4, frontend Phase 4.6). This section is the contract for FR-21 to FR-24. Architecture, prompt design, security, and the local development workflow are in `DECISIONS.md` §8.5; the frontend lifecycle is in `UI_WORKFLOW.md` §8. The provider is Groq and "the server" below is the local Node.js backend that runs on the user's computer (approved in Phase 4.1); there is no hosted deployment. The contract is unchanged by that decision and does not depend on the provider.

**Implementation status:** the local backend implements the server side of this whole contract (§11.1–§11.7) with Groq `openai/gpt-oss-120b` (Phase 4.4): the provider adapter, the provider-facing strict schema, every §11.4 validation rule, the §11.5 fingerprint (shared in `src/domain/inputFingerprint.ts`), and the §11.6 error mapping. Without `GROQ_API_KEY` and `GROQ_MODEL` every valid request is answered with `503 ai_not_configured`. One authorized live request (Phase 4.5) was accepted by Groq's strict schema and passed §11.4 unchanged. The browser side (Phase 4.6, `src/features/aiSummary/`) sends the §11.2 request, enforces the §11.5 fingerprint check and the §11.7 30-second deadline, maps §11.6 errors to fixed messages, and adds the summary to the CSV report.

### 11.1 Data boundary

The browser sends only the selected currency and the four confirmed inputs. The server derives every metric itself with the shared domain module (`createAnalysis`), so the browser never supplies calculated values that the server would have to trust or cross-check.

| Data                                                    | Browser → endpoint | Endpoint → AI provider                            |
| ------------------------------------------------------- | ------------------ | ------------------------------------------------- |
| Currency code                                           | Yes                | Yes                                               |
| BAC, PV, EV, AC (confirmed)                             | Yes                | Yes                                               |
| EVA metrics and budget comparison, with status / reason | No (derived)       | Yes, derived on the server                        |
| Metric names, formulas, deterministic interpretations   | No                 | Yes, from `metricDefinitions` / `interpretations` |
| Project name, description, manager, reporting date      | **Never**          | **Never**                                         |
| Input draft, import file contents, session state        | **Never**          | **Never**                                         |

The request schema is closed: unknown properties are rejected, so project metadata cannot be added to a request by mistake.

### 11.2 Request

`POST /api/ai-summary` with `Content-Type: application/json`. Maximum body size: **2,048 bytes** (a valid request is under 200 bytes).

```ts
interface AiSummaryRequest {
  schemaVersion: 1;
  currency: CurrencyCode; // one of the 15 codes in src/domain/currency.ts
  inputs: {
    bac: number;
    pv: number;
    ev: number;
    ac: number;
  };
}
```

All fields are required. Validation, in order, before the provider is called:

1. Method is `POST`, content type is `application/json`, body is at most 2,048 bytes and is valid JSON.
2. The body matches the schema exactly: no missing, extra, or wrongly typed properties; `schemaVersion` is `1`; `currency` is a supported code.
3. The inputs satisfy the application rules (`isValidEvaInputValues`): finite JSON numbers, at most `Number.MAX_SAFE_INTEGER`, within the currency's decimal places and exact precision (`DECISIONS.md` §3), BAC > 0, PV, EV, AC ≥ 0, PV ≤ BAC, EV ≤ BAC.

### 11.3 Successful response

`200 OK`, `Content-Type: application/json`, `Cache-Control: no-store`. Maximum body size: 16 KiB.

```ts
type EvidenceKey =
  | 'bac'
  | 'pv'
  | 'ev'
  | 'ac'
  | 'cv'
  | 'sv'
  | 'cpi'
  | 'spi'
  | 'eac'
  | 'etc'
  | 'vac'
  | 'tcpiBac'
  | 'tcpiEac'
  | 'plannedCompletion'
  | 'earnedCompletion'
  | 'budgetUtilization'
  | 'budgetVariance'
  | 'budgetVariancePercent';

type Assessment = 'favorable' | 'unfavorable' | 'neutral' | 'notAssessable';

interface AiSummaryResponse {
  schemaVersion: 1;
  /** Identifies the confirmed inputs this summary describes (§11.5). */
  inputFingerprint: string;
  /** ISO 8601 UTC time the summary was generated, e.g. "2026-11-11T10:15:00Z". */
  generatedAt: string;
  /** Operator-configured display label for the model, at most 80 characters. Not a credential. */
  modelLabel: string;
  content: {
    /** Overall explanation, 1–600 characters. */
    summary: string;
    /** 1–6 evidence-based observations about the supplied metrics. */
    observations: { text: string; assessment: Assessment; evidence: EvidenceKey[] }[];
    /** 0–4 potential cost-related risks. */
    costRisks: { text: string; evidence: EvidenceKey[] }[];
    /** 0–4 actionable suggestions. */
    recommendations: { text: string; evidence: EvidenceKey[] }[];
    /** 0–4 statements of what cannot be assessed from the supplied data. */
    limitations: { text: string; evidence: EvidenceKey[] }[];
  };
}
```

- Every `text` is plain text of 1–400 characters. Every `evidence` array has 1–4 unique keys.
- `evidence` is how AI statements reference facts. The response contains **no numeric fields**: the browser renders each referenced key with the value from its own deterministic analysis, never from the AI text.
- The server, not the model, sets `schemaVersion`, `inputFingerprint`, `generatedAt`, and `modelLabel`.

### 11.4 Response validation (server)

The provider's output is untrusted. The server parses it as JSON and rejects it (`502 invalid_ai_response`) unless all of these hold:

1. It matches the `content` schema exactly: no extra properties, all counts and lengths within limits.
2. Text is plain: no control characters other than spaces, no HTML or Markdown markup (`<`, `` ` ``, `](`), and no URLs.
3. **No invented numbers.** Every number written in a text (a run of digits, with optional sign, grouping, decimals, `%`, or currency symbol) must equal one of the display values supplied to the model for a **defined** fact, its absolute value, or the benchmark `1.00` / `1`. Undefined metrics have no display value, so no number can be stated for them.
4. **Undefined metrics.** An evidence key for an undefined metric may appear only in `limitations` or in an observation whose `assessment` is `notAssessable`. If CPI, SPI, or EAC is undefined, at least one limitation or `notAssessable` observation must reference it.
5. **Assessments match the facts.** An observation's `assessment` may not contradict the deterministic tone of a metric it references (for example, `favorable` with CPI < 1), and `notAssessable` is used only with an undefined metric.
6. The text contains no `NaN`, `Infinity`, `undefined`, or certainty wording from a short deny-list (for example "guaranteed", "will definitely", "certain to").

There is no automatic retry. A rejected output is not returned in part.

### 11.5 Input fingerprint

`inputFingerprint` is `v1:` followed by the currency and the four inputs, joined with `:`, each number written with JavaScript `String(number)`: for example `v1:USD:100000:40000:35000:42000`. Client and server compute it identically from the confirmed inputs. The client displays a response only if the fingerprint equals that of the analysis currently shown (`UI_WORKFLOW.md` §8).

### 11.6 Errors

Every error uses one schema, with `Cache-Control: no-store`. Messages are short, user-safe, and never include provider names, prompts, provider error text, stack traces, or credentials.

```ts
interface AiSummaryError {
  error: {
    code: AiSummaryErrorCode;
    message: string;
    /** Whether the same request may succeed if tried again later. */
    retryable: boolean;
  };
}
```

| Status | `code`                | Retryable | When                                                                                              |
| ------ | --------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`     | No        | Malformed JSON, schema mismatch, unknown property, unsupported currency.                          |
| 403    | `forbidden`           | No        | Local backend only: unexpected `Host`, or missing or unexpected `Origin` (`DECISIONS.md` §8.5.7). |
| 404    | `not_found`           | No        | Local backend only: any path other than `/api/ai-summary`.                                        |
| 405    | `method_not_allowed`  | No        | Any method other than `POST` (an `Allow: POST` header is sent).                                   |
| 413    | `payload_too_large`   | No        | Body over 2,048 bytes.                                                                            |
| 415    | `unsupported_media`   | No        | Content type is not `application/json`.                                                           |
| 422    | `invalid_inputs`      | No        | Inputs break the EVA validation rules.                                                            |
| 429    | `rate_limited`        | Yes       | Rate limit exceeded; a `Retry-After` header (seconds) is sent.                                    |
| 502    | `invalid_ai_response` | Yes       | The provider's output failed §11.4.                                                               |
| 502    | `ai_provider_error`   | Yes       | The provider returned an error or an unreadable response.                                         |
| 503    | `ai_not_configured`   | No        | `GROQ_API_KEY` or `GROQ_MODEL` is not set, or Groq rejected the key (401/403).                    |
| 503    | `ai_unavailable`      | Yes       | The provider is unreachable or overloaded; `Retry-After` may be sent.                             |
| 504    | `ai_timeout`          | Yes       | The provider did not answer within the server deadline (25 s).                                    |
| 500    | `internal_error`      | Yes       | Any other server failure.                                                                         |

### 11.7 Timeouts

- The browser aborts the request after **30 seconds** and shows the timed-out state.
- The server gives the provider a **25-second** deadline, so it can answer `504 ai_timeout` before the browser gives up, and cancels the provider call when the deadline passes or the client disconnects.
- Neither side retries automatically.

### 11.8 Example

Request (the fixture in `EVA_FORMULAS.md` §8):

```json
{
  "schemaVersion": 1,
  "currency": "USD",
  "inputs": { "bac": 100000, "pv": 40000, "ev": 35000, "ac": 42000 }
}
```

Response:

```json
{
  "schemaVersion": 1,
  "inputFingerprint": "v1:USD:100000:40000:35000:42000",
  "generatedAt": "2026-11-11T10:15:00Z",
  "modelLabel": "Configured AI model",
  "content": {
    "summary": "Both cost and schedule performance are currently unfavorable in earned-value terms. The completed work cost more than its budgeted value, and less work value has been earned than planned. If the current cost efficiency continues, the project is forecast to finish above its approved budget.",
    "observations": [
      {
        "text": "Each unit of actual cost has earned about 0.8333 units of budgeted value, so the work completed so far cost more than it was worth in budget terms.",
        "assessment": "unfavorable",
        "evidence": ["cpi", "cv"]
      },
      {
        "text": "Earned value is below planned value, so progress is behind the plan in value terms. This does not say how many days late the project is.",
        "assessment": "unfavorable",
        "evidence": ["spi", "sv"]
      },
      {
        "text": "58.0% of the total budget has not been spent yet. This shows budget remaining, not cost efficiency, so it does not offset the unfavorable CPI.",
        "assessment": "neutral",
        "evidence": ["budgetVariance", "budgetVariancePercent"]
      }
    ],
    "costRisks": [
      {
        "text": "If the current cost efficiency continues, the forecast final cost of $120,000.00 exceeds the approved budget of $100,000.00.",
        "evidence": ["eac", "vac", "bac"]
      },
      {
        "text": "Finishing within the original budget would require the remaining work to be performed more efficiently than the work so far.",
        "evidence": ["tcpiBac", "cpi"]
      }
    ],
    "recommendations": [
      {
        "text": "Review where actual costs for the completed work exceeded their budgeted value before committing further spending.",
        "evidence": ["cv", "cpi"]
      },
      {
        "text": "Check whether the remaining work plan is realistic given the current schedule performance, and update the forecast at the next reporting date.",
        "evidence": ["spi", "eac"]
      }
    ],
    "limitations": []
  }
}
```

With AC = 0 (CPI and every EAC-based metric undefined), a valid response must contain, for example, `{ "text": "Cost efficiency and the cost forecast cannot be assessed because no actual cost has been recorded yet.", "evidence": ["cpi", "eac"] }` in `limitations`, and may not state any value for CPI, EAC, ETC, VAC, or TCPI against EAC.
