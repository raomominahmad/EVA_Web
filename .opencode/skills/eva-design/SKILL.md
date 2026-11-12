---
name: eva-design
description: Design and refine the EVA Earned Value Analysis application consistently across its project workflow, forms, report, charts, and responsive states.
---

# EVA Design Skill

Use this skill when implementing or refining EVA's user interface.

## Read before implementation

- `AGENTS.md`
- `docs/PROJECT_REQUIREMENTS.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/UI_WORKFLOW.md`
- `docs/EVA_FORMULAS.md` when showing or formatting metrics

## Product identity

EVA is a focused analytical utility, not a generic AI dashboard. The interface should communicate precision, transparency, and calm confidence.

## Design approach

1. Establish and reuse design tokens before styling individual screens.
2. Build a consistent shell and three-step progress indicator.
3. Implement project details, then EVA inputs, then the analysis report.
4. Use reusable field, metric, status, section, and chart components.
5. Keep labels, definitions, units, and interpretations close to the data they explain.
6. Design loading, error, empty, undefined, and mobile states deliberately.
7. Inspect the actual rendered UI and refine based on evidence.

## Visual guardrails

- Use restrained color and clear contrast.
- Prefer whitespace and hierarchy over decorative containers.
- Avoid generic AI gradients, glassmorphism, excessive shadows, and card overload.
- Use tabular numerals for numerical metrics.
- Do not use color as the only status indicator.
- Keep charts simple, labelled, and consistent with the displayed values.
- Respect reduced-motion preferences.

## Functional guardrails

- Do not implement formulas inside visual components.
- Consume typed results from the calculation layer.
- Do not display `NaN` or infinity.
- Never plot undefined values as zero.
- Preserve form values across workflow navigation.
- Follow the validation and formula contract in `docs/EVA_FORMULAS.md`.

## Completion check

Before declaring a screen complete, verify:

- Visual hierarchy and spacing.
- Desktop and narrow mobile layouts.
- Keyboard navigation and focus visibility.
- Field labels and error associations.
- Correct values and units.
- No placeholder content or fake data in the real report.
