# EVA — Formula and Calculation Reference

This document is the authoritative source for calculation behavior in the application.

Sections 1–9 define the Earned Value Management (EVM) metrics. Section 10 defines a supplementary budget-versus-actual comparison required by the assignment (implemented, FR-19). It adds metrics and changes nothing in sections 1–9.

## 1. Input definitions

All monetary values must use the same currency.

| Symbol | Name                 | Definition                                                              |
| ------ | -------------------- | ----------------------------------------------------------------------- |
| BAC    | Budget at Completion | Total approved budget for the project.                                  |
| PV     | Planned Value        | Budgeted value of work scheduled to be completed by the reporting date. |
| EV     | Earned Value         | Budgeted value of work actually completed by the reporting date.        |
| AC     | Actual Cost          | Actual cost incurred for the work completed by the reporting date.      |

## 2. Core performance metrics

### Cost Variance (CV)

\[
CV = EV - AC
\]

- CV > 0: under budget for the work performed.
- CV = 0: cost is exactly equal to earned value.
- CV < 0: over budget for the work performed.

### Schedule Variance (SV)

\[
SV = EV - PV
\]

- SV > 0: more work value has been earned than planned by the reporting date.
- SV = 0: work is progressing exactly to the plan in value terms.
- SV < 0: less work value has been earned than planned.

SV is expressed in the project's currency. It is not a direct number of days ahead or behind schedule.

### Cost Performance Index (CPI)

\[
CPI = \frac{EV}{AC}
\]

- CPI > 1: favorable cost efficiency.
- CPI = 1: earned value equals actual cost.
- CPI < 1: unfavorable cost efficiency.
- If AC = 0, CPI is undefined and must display `N/A`.

### Schedule Performance Index (SPI)

\[
SPI = \frac{EV}{PV}
\]

- SPI > 1: favorable schedule performance in earned-value terms.
- SPI = 1: earned value equals planned value.
- SPI < 1: unfavorable schedule performance.
- If PV = 0, SPI is undefined and must display `N/A`.

## 3. Forecast metrics

### Estimate at Completion (EAC)

\[
EAC = \frac{BAC}{CPI}
\]
This application uses the assumption that the current cost efficiency (CPI) continues for the remaining work.

Equivalent form when AC > 0:
\[
EAC = \frac{BAC \times AC}{EV}
\]
The implementation should use the primary formula or a mathematically equivalent stable form and explicitly handle undefined denominators.

If CPI is undefined or zero, EAC is undefined and must display `N/A`.

### Estimate to Complete (ETC)

\[
ETC = EAC - AC
\]
ETC is undefined if EAC is undefined.

Under the valid input constraints used by this application, ETC cannot be negative. When EAC is defined, `EV > 0` and `AC > 0`; because `EV <= BAC`, it follows that:

\[
ETC = EAC - AC = \frac{BAC \times AC}{EV} - AC = AC \left(\frac{BAC}{EV} - 1\right) \ge 0
\]

The implementation must still keep the formula generic and must never clamp a calculated value. If the formula is ever evaluated with inputs outside these constraints, preserve the result and explain it. A negative ETC is not a valid outcome for validated application inputs.

### Variance at Completion (VAC)

\[
VAC = BAC - EAC
\]

- VAC > 0: forecast below the approved budget.
- VAC = 0: forecast equals the approved budget.
- VAC < 0: forecast above the approved budget.
- VAC is undefined if EAC is undefined.

### To-Complete Performance Index against BAC

\[
TCPI_{BAC} = \frac{BAC - EV}{BAC - AC}
\]
This expresses the cost efficiency required on the remaining work to finish within the original BAC.

If BAC − AC = 0, the metric is undefined and must display `N/A`.

### To-Complete Performance Index against EAC

\[
TCPI_{EAC} = \frac{BAC - EV}{EAC - AC}
\]
This expresses the cost efficiency required on the remaining work to finish within the calculated EAC.

If EAC is undefined or EAC − AC = 0, the metric is undefined and must display `N/A`.

## 4. Additional completion indicators

These are value-based ratios, not proof of physical completion unless the project's EV method supports that interpretation.

### Planned completion ratio

\[
Planned\ Completion = \frac{PV}{BAC} \times 100
\]
If BAC is zero, undefined. BAC validation prevents this case.

### Earned completion ratio

\[
Earned\ Completion = \frac{EV}{BAC} \times 100
\]

### Budget utilization ratio

\[
Budget\ Utilization = \frac{AC}{BAC} \times 100
\]

Because BAC > 0, these ratios are mathematically defined for valid inputs.

## 5. Validation rules

- BAC must be a finite number greater than zero.
- PV, EV, and AC must be finite, non-negative numbers.
- PV must not exceed BAC.
- EV must not exceed BAC.
- EV is allowed to exceed PV. Do not reject this condition.
- AC is allowed to exceed BAC.
- PV = 0 is valid.
- AC = 0 is valid.
- Do not reject a valid input merely because it produces an unfavorable result.
- Do not silently coerce blank input to zero. A blank required field is a validation error.
- Reject `NaN`, positive/negative infinity, and non-numeric input.
- If numeric values are entered as strings, parse them explicitly and validate the parsed result.

## 6. Undefined values and numerical safety

- Never render `NaN`, `Infinity`, or `-Infinity`.
- Use a consistent representation such as `N/A` for undefined ratios and dependent forecasts.
- Keep calculations at full JavaScript numeric precision internally; round only for display/export formatting.
- Avoid using rounded display values as inputs to subsequent calculations.
- Consider floating-point display noise. For comparisons to zero, use a documented tolerance if needed; do not change the underlying calculation.
- Format currency values with the selected currency and locale, while preserving raw numeric values for CSV.

## 7. Interpretation rules

Interpretations must be deterministic and based on the calculated values:

- CV and SV: compare against zero.
- CPI and SPI: compare against one at the displayed precision (four decimal places), so a value shown as `1.0000` is described as effectively equal to one, not as favorable or unfavorable. The calculated value is not changed.
- EAC and VAC: explain forecast relative to BAC.
- TCPI: explain the required efficiency, not whether it is achievable without additional project context.

Avoid absolute claims such as “the project will finish late” based only on SV or SPI. Prefer “schedule performance is currently unfavorable in earned-value terms.” Avoid describing a forecast as certain.

## 8. Calculation examples for tests

Use these values as a known-good test fixture:

- BAC = 100,000
- PV = 40,000
- EV = 35,000
- AC = 42,000

Expected results:

- CV = -7,000
- SV = -5,000
- CPI = 35,000 / 42,000 ≈ 0.8333333333
- SPI = 35,000 / 40,000 = 0.875
- EAC = 100,000 / CPI = 120,000
- ETC = 120,000 − 42,000 = 78,000
- VAC = 100,000 − 120,000 = -20,000
- TCPI_BAC = 65,000 / 58,000 ≈ 1.1206896552
- TCPI_EAC = 65,000 / 78,000 ≈ 0.8333333333
- Planned completion = 40%
- Earned completion = 35%
- Budget utilization = 42%

## 9. Implementation contract

Implement calculations as pure functions with typed inputs and outputs. Keep undefined values explicit (for example `number | null`) and centralize display formatting so the UI never has to guess whether a value is valid.

## 10. Budget-versus-actual comparison

Status: implemented (`PROJECT_REQUIREMENTS.md` FR-19) in `src/domain/budgetComparison.ts`.

This comparison answers a simpler question than EVM: _how does spending to date compare with the total approved budget?_ It uses only the existing inputs and the same validation rules (§5).

### 10.1 Terms

| Assignment term     | Value | Notes                                                                    |
| ------------------- | ----- | ------------------------------------------------------------------------ |
| Estimated cost      | BAC   | The total approved budget. A label for the input, not a new calculation. |
| Actual cost         | AC    | Actual cost incurred to the reporting date. A label for the input.       |
| Budget variance     | —     | Calculated, §10.2.                                                       |
| Percentage variance | —     | Calculated, §10.3.                                                       |

"Estimated cost" here means the approved budget (BAC), as decided for the assignment. It is not the forecast EAC (§3), and budget variance is not Cost Variance (§10.4).

### 10.2 Budget variance

\[
Budget\ Variance = BAC - AC
\]

- Budget variance > 0: spending to date is below the total approved budget; the value is the budget not yet spent.
- Budget variance = 0: spending to date equals the total approved budget.
- Budget variance < 0: spending to date already exceeds the total approved budget.

Expressed in the project's currency. Always defined for valid inputs.

### 10.3 Percentage variance

\[
Percentage\ Variance = \frac{BAC - AC}{BAC} \times 100
\]

- Expressed as a percentage of BAC and formatted with one decimal place and an explicit `%` sign.
- Defined for valid inputs because BAC > 0. The implementation must still divide through the shared safe-division helper, so a zero BAC would be undefined (`N/A`) rather than infinite.
- Negative values are valid and are never clamped (for example, AC > BAC).
- The implementation evaluates it as `(BAC − AC) × 100 / BAC`, which is algebraically identical and exact for ordinary inputs (58,000 × 100 / 100,000 = 58, whereas 0.58 × 100 = 57.99999999999999 in floating point).
- Algebraically, percentage variance = 100 − budget utilization (§4). It must still be calculated from BAC and AC as stated above, not from a rounded utilization value.

### 10.4 Difference from EVA Cost Variance

| Measure         | Formula      | Question it answers                                                                       |
| --------------- | ------------ | ----------------------------------------------------------------------------------------- |
| Budget variance | BAC − AC     | How much of the total approved budget has not been spent yet?                             |
| Cost Variance   | CV = EV − AC | Did the work completed so far cost more or less than its budgeted value?                  |
| VAC             | BAC − EAC    | Is the project forecast to finish above or below budget, if current efficiency continues? |

Budget variance ignores how much work has been done, so a positive budget variance does **not** mean cost performance is favorable. With the fixture in §8, budget variance is +58,000 while CV is −7,000: 58% of the budget remains unspent, yet the completed work cost more than it was worth in earned-value terms.

Presentation rules:

- Never label budget variance or percentage variance as CV, and never use the CV symbol for them.
- Do not describe a positive budget variance as favorable or a negative one as unfavorable on its own. Describe it as budget remaining or as spending above the total budget, and refer to CV and CPI for cost efficiency.
- These are not standard EVM acronyms. Use the full names "Budget variance" and "Percentage variance".

### 10.5 Test fixtures

| BAC     | AC      | Budget variance | Percentage variance          |
| ------- | ------- | --------------- | ---------------------------- |
| 100,000 | 42,000  | 58,000          | 58%                          |
| 100,000 | 0       | 100,000         | 100%                         |
| 100,000 | 100,000 | 0               | 0%                           |
| 100,000 | 150,000 | −50,000         | −50%                         |
| 3       | 1       | 2               | 66.666…% (displayed `66.7%`) |
