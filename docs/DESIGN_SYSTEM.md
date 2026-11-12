# EVA — Design System

## 1. Design direction

Create a polished, calm, professional SaaS-style interface for a focused analytical tool. The product should feel trustworthy, precise, and approachable—not like a generic AI dashboard.

Use the clarity and restraint of products such as Linear, Stripe, and Vercel as broad inspiration. Do not copy their interfaces.

## 2. Visual principles

- Clarity before decoration.
- Strong typographic hierarchy.
- Generous but disciplined whitespace.
- Restrained color; use color to communicate meaning.
- Consistent alignment and spacing.
- Data visualizations should be legible and directly useful.
- Avoid excessive cards, gradients, glassmorphism, oversized rounded corners, and decorative blobs.
- Avoid making every section a separate bordered card.
- Do not use color as the only carrier of meaning.

## 3. Suggested palette

Treat these as starting tokens; validate contrast and refine consistently during implementation.

Since Phase 4.18 the whole site uses one dark theme, taken from the landing page, so every view
looks the same. The values below are the ones in `tokens.css`; contrast is measured on
`--color-surface`.

| Token                   | Value     | Use                                         |
| ----------------------- | --------- | ------------------------------------------- |
| `--color-bg`            | `#080F21` | Page ground (night)                         |
| `--color-surface`       | `#0F1A33` | Cards: form, aside, report sections, dialog |
| `--color-text`          | `#E8EDF6` | Primary text (14.7:1)                       |
| `--color-text-muted`    | `#A3B3CD` | Secondary text (8.1:1)                      |
| `--color-border`        | `#1F2D4B` | Dividers and card edges                     |
| `--color-border-strong` | `#5B6F96` | Control borders (3.4:1)                     |
| `--color-primary`       | `#FFFFFF` | Primary action: white pill, navy text       |
| `--color-link`          | `#A78BFA` | Links and accent symbols (6.4:1)            |
| `--color-focus`         | `#C4B5FD` | Focus rings                                 |
| `--color-positive`      | `#4ADE80` | Favorable result                            |
| `--color-negative`      | `#FF8B7E` | Unfavorable result                          |
| `--color-warning`       | `#FBBF5A` | Caution / attention                         |
| `--color-info`          | `#8AB4FF` | Informational emphasis                      |

Do not use positive/negative colors for decoration. Pair color-coded states with text labels, icons, or symbols.

Navy grounds (Phase 4.16) carry the brand: the site header and footer on every view, the landing
hero, and the landing page's closing band. They use `--color-navy-deep` (`#101D36`) and
`--color-navy-raised` (`#1C3155`), with text in `--color-on-navy` (white, 16.8:1),
`--color-on-navy-muted` (`#C3CEE0`, 10.6:1) and `--color-on-navy-subtle` (`#A3B3CD`, 7.9:1).
A region on navy takes the global `on-navy` class, which turns focus rings white. Actions on navy
use the `onNavy` (white) and `onNavySecondary` (outlined, `#6A7FA3` border, 4.1:1) button
variants.

The landing page (Phase 4.17) sits on a darker night ground, `--color-night` (`#080F21`) and
`--color-night-raised`, with `--color-navy-secondary` (`#172743`) for bands. Its accents are
`--color-violet` (`#8B5CF6`, decorative light and icons only), `--color-violet-text` (`#A78BFA`,
7.0:1 on night) and `--color-cyan` (`#60A5FA`). `--gradient-accent` (violet to blue) colours one
phrase per heading, as the brief asked; a forced-colors fallback shows plain text. Glass cards use
`--color-night-card` with `--color-night-border` hairlines. Chart series are blue for planned
(`--color-data-planned` `#60A5FA`), violet for earned (`--color-data-earned` `#A78BFA`), slate for
actual cost (`--color-data-actual` `#94A3B8`), teal hatching for BAC and an amber dashed outline
for EAC, each at least 6:1 on the surface; every series keeps its label, legend and text values.
The workflow and report pages (Phase 4.18) share the glass header and night footer, and a faint
violet and blue glow falls from the top of the page, as on the landing hero.

Shared rules for consistency (Phase 4.19 polish): every button and text field uses
`--radius-control` (8px), on the landing page and in the workflow; secondary buttons are outlines
on a transparent ground. Every metric symbol (BAC, PV, EV, AC, CV, CPI...) uses the same violet
chip (`--color-chip-bg`, `--color-chip-border`, `--color-chip-text`) in the form, the aside, the
report and the landing preview. The EVA mark is `--color-brand-mark` everywhere. Text fields sit
on `--color-field`, slightly below the card surface. Informational boxes (baseline assumptions,
the budget callout, the AI reading notes) share one notice style.

Report reading order (Phase 4.20): the headline results are four tiles whose values share one
line; cost and schedule sections sit side by side on wide screens; each metric reads name and
status, value, plain-language meaning, then a quiet dashed-rule footer with the formula and
definition. Metrics in a row share rows through subgrid, so values and formulas line up. The AI
summary leads with its summary paragraph, then Observations across the full width and Cost risks,
Recommendations and Limitations side by side, each with an icon; EVA's reading notes follow as
small print outside the AI frame. The AI summary section is the report's one violet-lit card
(`--color-ai-surface`, `--color-ai-border`, a violet and blue glow and lit top edge, a sparkle icon
tile by its heading) so it is found at a glance; its ground stays as dark as the other cards, and
"Generate AI summary" uses the violet `accent` button (white text 5.7:1 or more).

Notices (alerts, warnings, information, success) use a full 1px border and a tinted ground from `tokens.css` (`--color-negative-subtle`/`-border`, `--color-warning-subtle`/`-border`, `--color-positive-subtle`/`-border`, `--color-primary-subtle` with `--color-info-border`), plus an icon and text. Do not use a thick colored left border as an accent. Placeholder text uses `--color-placeholder` (at least 4.5:1 on the surface); browser surfaces (`accent-color`, caret, selection, scrollbar) are themed from the same tokens in `base.css`.

## 4. Typography

- Prefer Inter or Geist if already available; otherwise use a high-quality system sans-serif stack.
- Use tabular numerals for metric values.
- Keep body copy readable and restrained.
- Use sentence case for headings and labels.
- Scale: page title `--text-3xl` (at most 2.5rem), section heading `--text-section` (1.3125rem), body and labels `--text-sm`/`--text-base`.
- No uppercase or monospace labels above headings; the project being analysed is shown as a wrapping "Project:" line under the page lead.
- Avoid tiny low-contrast helper text.
- Use a clear hierarchy for page title, section heading, field label, helper text, and metric value.

## 5. Layout and spacing

- Use a consistent spacing scale, preferably based on 4px or 8px increments.
- Keep the main content width comfortable for reading; avoid excessively wide form fields and report paragraphs.
- Align page titles, section content, and primary actions to a consistent container.
- Use responsive layouts: multi-column metric groups on wide screens should collapse cleanly on mobile.
- On mobile, avoid horizontal scrolling for forms and primary report content.

## 6. Components

### Navigation / workflow indicator

- Show the three stages: Project details → EVA inputs → Analysis.
- The stepper sits in the navy header: the current step is a white marker with a navy numeral,
  completed steps a white-outlined check, upcoming steps a muted outline.
- Clearly indicate current, completed, and upcoming steps.
- Do not rely on color alone to indicate progress.

### Forms

- Place labels above fields.
- Include concise descriptions for BAC, PV, EV, and AC.
- Show currency context consistently.
- Use appropriate numeric input behavior and validation messages.
- Preserve user input when moving between steps.
- Provide clear primary and secondary actions.

### Metric presentation

Every metric presentation should make clear:

1. Metric name and acronym.
2. Value and unit.
3. Whether the result is favorable, unfavorable, neutral, or undefined, where applicable.
4. A concise interpretation.
5. Formula or definition in a tooltip, expandable detail, or nearby explanation.

Do not give every metric identical visual prominence. Emphasize the most useful summary indicators, then provide detailed sections.

"Performance at a glance" shows four headline values from the same analysis: CPI and SPI with their status badges, and EAC and budget variance with their own labels and no status, so the forecast and the budget comparison are not read as a cost-efficiency verdict. In metric lists the name always sits above the value, so values align across a row. Report sections are separated by a full-width 1px rule rather than cards.

### Charts

- The three charts, including the two cost comparison charts, are specified in `UI_WORKFLOW.md` §4 and implemented in `src/components/charts/`.
- Use charts only when they make relationships easier to understand.
- Include chart titles, axis labels, legends where necessary, and accessible text equivalents.
- Do not use 3D charts.
- Avoid misleading truncated axes.
- Do not plot undefined values as zero.
- Ensure chart values match the report metrics.
- Use restrained colors and avoid unnecessary animation.

### Buttons and controls

- Primary action should be visually distinct.
- Secondary actions should remain clearly available without competing with the primary action.
- Provide hover, focus, active, disabled, and error states.
- Ensure keyboard focus is visible.
- A destructive action is confirmed in a modal dialog (`ConfirmDialog`, native `<dialog>` with `role="alertdialog"`). Focus starts on "Cancel"; Escape cancels. Only the confirming button uses the `danger` variant (`--color-negative` with navy text, 7.4:1), and its label names the action ("Clear and start over"), so the color is never the only signal.

### Landing page and workspace

- The landing page uses the same tokens, Geist, lucide icons and components as the workflow, on
  the dark night ground (Phase 4.17). Its headline uses `--text-display` (at most 3.5rem), with
  the second sentence in the accent gradient; section headings use `--text-2xl`.
- Header: sticky glass bar (`rgb(8 15 33 / 72%)`, backdrop blur) with the EVA identity, in-page
  links to Features, How it works and About (hidden under 721px), and "Create a project".
- Hero: centered badge, headline, lead, pill actions ("Create a project", "Explore sample report"
  to `#sample-report`) and the privacy note, lit by two violet/blue spotlights over a faint grid,
  then the sample report preview rising from a horizon glow.
- The sample report preview is a navy `--radius-2xl` card, styled like the report, labelled "Sample data —
  Illustrative analysis", calculated by the real engine from the worked example in
  `EVA_FORMULAS.md` §8: the four inputs; CPI, SPI, CV, SV, EAC and budget variance (BAC − AC)
  tiles with the report's tone badges or notes; and the "Budget, actual cost, and forecast" chart
  on the report's scale. From 50rem of its own width (container query) tiles and chart sit side by
  side; under 34rem names become screen-reader-only and the footnote is hidden.
- Features: eight glass cards (four, two, then one column) with a lucide icon tile and formulas in
  Geist Mono read from `metricDefinitions.ts`. Cards lift slightly on hover.
- "How it works": four numbered steps joined by a gradient connector, vertical under 901px.
- AI summary section: what EVA calculates beside what the AI explains, and what is sent (currency
  and four values only).
- Closing call to action with a radial glow, then the footer with "About EVA" (`#about`) and
  in-page links.
- No testimonials, logos, user counts, ratings or invented features anywhere.
- Workflow and report use the same dark theme: forms, the workspace aside and every report
  section are navy cards (`--radius-xl`, `--shadow-card`, 1px border) on the night ground.
- In-page links scroll smoothly on the landing page only; reduced motion turns this off.
- On the project details and EVA inputs steps, a workspace aside beside the form (below it under
  1080px) shows real supporting context: the four inputs to come and where data goes, or the
  project summary and what the report will include.
- Motion: view and step changes use one short entrance (a 10px lift, transform only, so text
  never loses contrast mid-transition). On the landing page the preview's bars draw in once
  (transform only, staggered), so the forecast visibly runs past the dashed budget line. Reduced
  motion removes both.

## 7. Accessibility

- Meet WCAG AA contrast where practical.
- Use semantic landmarks and heading order.
- Associate every input with a visible label.
- Provide errors in text and associate them with the relevant field.
- Ensure all actions work with a keyboard.
- Respect reduced-motion preferences.
- Provide text alternatives or equivalent data tables for charts.

## 8. Responsive behavior

- Design mobile layouts intentionally, not as compressed desktop layouts.
- Stack form fields and report sections on narrow screens.
- Keep primary actions easy to reach.
- Prevent metric cards, tables, and charts from overflowing the viewport.
- Test at approximately 375px, 768px, and 1440px widths.

## 9. Motion

Use subtle, purposeful transitions only:

- Step transitions.
- Small hover/focus feedback.
- Optional restrained chart entrance.
  Do not animate values in a way that makes them difficult to read. Respect `prefers-reduced-motion`.

## 10. Visual quality checklist

- Does the page have a clear focal point?
- Is the hierarchy obvious without reading every label?
- Are spacing and alignment consistent?
- Are numeric values easy to scan?
- Are unfavorable and favorable states understandable without color?
- Does the mobile view feel designed rather than squeezed?
- Is any decoration competing with the data?

## 11. Assignment-scope components

Status: §11.1–§11.3 (file import) are implemented in `src/features/import/ImportPanel.tsx`. §11.5 (report presentation and export) is implemented. §11.4 (AI summary) is implemented in `src/features/aiSummary/AiSummaryPanel.tsx` (FR-21 to FR-24); it is shown only in builds with `VITE_AI_SUMMARY_ENABLED=true`. These components reuse the existing tokens, `Field`, `Button`, and form controls, and follow the _precise engineering measurement interface_ direction in `DECISIONS.md` §6.

### 11.1 File upload

- Use a native `<input type="file" accept=".csv,.xlsx">` with a visible label, styled as a secondary button ("Choose file"). A drop area may surround it, but the button must always work with keyboard and screen readers.
- State the accepted types, the 1 MiB (1,048,576-byte) limit, and the expected columns next to the control, with a one-row example in tabular numerals.
- Show the chosen file name and size after selection, with a "Choose a different file" action.
- The import panel is an inline, collapsible region below the step header (not a modal), so the form stays visible for context. Opening it moves focus to its heading; closing it returns focus to "Import from file".
- Reading state: a short text status ("Reading file…") in a polite live region. No spinner-only states.

### 11.2 Import preview

- Use a real `<table>` with a caption naming the file and worksheet, column headers, and a row-header cell holding the spreadsheet row number.
- Show values exactly as read, in tabular numerals, right-aligned for amounts. Do not reformat them as currency before import; the preview shows the file's contents, not the result.
- Row selection uses radio buttons labelled with the row number; exactly one valid row must be selected. Rows with errors show a disabled radio and the text "2 errors"; valid rows show "Valid" with a check icon. Never rely on color alone.
- Ignored columns are listed under the table in muted text ("Ignored columns: Notes, Owner").
- On narrow screens the table scrolls horizontally inside its own container (`overflow-x: auto`) with the row-number column kept visible; the page itself must not scroll horizontally.

### 11.3 Import validation errors

- File-level errors: one alert block at the top of the panel, using the negative color for the border and icon, the `CircleAlert` icon, and text. Focus moves to it.
- Cell-level errors: the cell gets a negative-color outline, an icon, and a visually hidden "Error:" prefix; the message is associated with the cell through `aria-describedby`.
- An error summary above the table lists every cell error as "Row N, Column: message", each linking to its cell. Show it whenever any row has errors, even if another row is valid.
- Messages use the same wording as manual-entry errors, prefixed with the row and column. A resource-limit error explains the problem in plain terms and suggests saving only the EVA values in a new file; it does not show technical archive details.
- "Use these values" stays disabled until a valid row is selected, and the reason is stated in text next to it.

### 11.4 AI-generated summary

- Present it as a distinct report section with the heading "AI-generated summary", placed before "Assumptions and limitations", with a small neutral badge reading "AI-generated" (text, not an icon alone). Do not use gradients, sparkle icons, glow, or "magic" styling; it must look less authoritative than the calculated results, not more.
- Body text uses the standard text color on the default surface, in five sub-headed parts: Summary, Observations, Cost risks, Recommendations, and Limitations (empty parts omitted). Lists use the existing list styles.
- Each observation shows its assessment with the same text-and-icon badge as the report (Favorable, Unfavorable, Neutral, Not assessable).
- Each item ends with small neutral evidence chips in tabular numerals, for example `CPI 0.8333` or `EAC N/A`. Chip values come from the deterministic analysis, so readers can check every AI statement against the calculated facts.
- A muted note under the heading: "Generated by an AI model from the calculated results above. It may be incomplete or wrong; the calculated values are authoritative."
- The data disclosure before generating is plain text next to the action, listing what is and is not sent.
- Nothing in the summary is persisted; after a reload the section returns to its idle state.
- The generate, regenerate, and retry actions are secondary buttons, like the CSV export, so the optional AI action never outranks the calculated report. Generated content sits in one dashed-outline frame on the surface, marking it as provisional and separate from the calculated sections.
- States (`UI_WORKFLOW.md` §8.2): not requested (action and disclosure), loading (text status in a polite live region and "Cancel"; report remains interactive), success (content, generation time, model label, "Regenerate"), error or timed out (message with a warning-colored `CircleAlert` icon and border and, when retryable, "Try again"), not configured (a one-line note and no action, after the backend answers `503 ai_not_configured`). When the build does not enable the feature, the section is absent. The actions use neutral icons (`FileText` to generate, `RefreshCw` to regenerate or retry, `X` to cancel). No skeleton shimmer.
- Render AI text as plain text only. Never inject it as HTML or Markdown.

### 11.5 Report presentation and export

- The budget-versus-actual section reuses the metric presentation in §6: name, value, unit, formula, and interpretation. Its section note that it differs from Cost Variance sits directly under the heading, not in a tooltip.
- Budget variance and percentage variance use neutral styling with a text description ("Budget remaining", "Spending above total budget"), not favorable/unfavorable colors (`EVA_FORMULAS.md` §10.4).
- Charts use the existing data tokens for PV, EV, and AC. BAC and EAC use `--color-data-budget` (#0F766E, 5.5:1 on the surface) and `--color-data-forecast` (#A15C07, 5.2:1). `--color-data-planned` was darkened to #7D8CA0 (3.4:1) so every series meets 3:1 against the surface. Several series are close to each other in luminance, so series are never told apart by color alone: BAC is hatched, EAC has a dashed outline, a true zero is a thin mark at the axis, an undefined value reads "Not plotted" with its reason, and every bar has a direct text label and value.
- The export action is a secondary button with a download icon and the text "Download report (CSV)". After download, a polite status message confirms the file name.
