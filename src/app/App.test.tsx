import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { WORKFLOW_STORAGE_KEY } from './workflow/workflowStorage';
import { renderApp } from '@/test/renderApp';

function getStepItems() {
  return screen.getAllByRole('listitem').filter((item) => item.closest('nav'));
}

function expectCurrentStep(index: number) {
  getStepItems().forEach((item, itemIndex) => {
    if (itemIndex === index) {
      expect(item).toHaveAttribute('aria-current', 'step');
    } else {
      expect(item).not.toHaveAttribute('aria-current');
    }
  });
}

function heading(name: string) {
  return screen.getByRole('heading', { level: 1, name });
}

async function completeProjectStep(user: UserEvent, name = 'Billing platform') {
  await user.type(screen.getByLabelText('Project name'), name);
  await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));
}

async function fillInputs(
  user: UserEvent,
  values: { currency?: string; bac?: string; pv?: string; ev?: string; ac?: string } = {},
) {
  const { currency = 'USD', bac = '100,000', pv = '40000', ev = '35000', ac = '42000' } = values;

  await user.selectOptions(screen.getByLabelText('Currency for all amounts'), currency);

  for (const [label, value] of [
    [/Budget at Completion/, bac],
    [/Planned Value/, pv],
    [/Earned Value/, ev],
    [/Actual Cost/, ac],
  ] as const) {
    const input = screen.getByLabelText(label);
    await user.clear(input);
    if (value !== '') {
      await user.type(input, value);
    }
  }
}

const LANDING_TITLE = 'Understand project performance. Make smarter decisions.';

/** The header and hero "Create a project" buttons, then the closing "Create your first analysis". */
const startButtons = () => [
  ...screen.getAllByRole('button', { name: 'Create a project' }),
  screen.getByRole('button', { name: 'Create your first analysis' }),
];

describe('Landing page', () => {
  it('opens on the landing page in a new tab, without the workflow progress', () => {
    render(<App />);

    expect(heading(LANDING_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.queryByRole('navigation', { name: 'Workflow' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument();
    // Header, hero, and closing calls to action all start a project.
    expect(screen.getAllByRole('button', { name: 'Create a project' })).toHaveLength(2);
    expect(startButtons()).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Explore sample report' })).toHaveAttribute(
      'href',
      '#sample-report',
    );
    expect(document.getElementById('sample-report')).toContainElement(
      screen.getByRole('figure', { name: 'Sample report preview' }),
    );
    // Every site link points at a section that exists on the page.
    const siteNav = screen.getByRole('navigation', { name: 'Site' });
    for (const [name, id] of [
      ['Features', 'features'],
      ['How it works', 'how-it-works'],
      ['About', 'about'],
    ] as const) {
      expect(within(siteNav).getByRole('link', { name })).toHaveAttribute('href', `#${id}`);
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(screen.getByRole('heading', { level: 2, name: 'How it works' })).toBeInTheDocument();
  });

  it('labels the report preview as sample data calculated by EVA', () => {
    render(<App />);
    const preview = screen.getByRole('figure', { name: 'Sample report preview' });

    expect(preview).toHaveTextContent('Sample data — Illustrative analysis');
    // The documented worked example (EVA_FORMULAS.md §8), calculated by the same engine.
    expect(preview).toHaveTextContent('0.8333');
    expect(preview).toHaveTextContent('0.8750');
    expect(preview).toHaveTextContent('$120,000.00');
    expect(preview).toHaveTextContent('$58,000.00');
    // CV = EV − AC and SV = EV − PV, from the same engine.
    expect(preview).toHaveTextContent('-$7,000.00');
    expect(preview).toHaveTextContent('-$5,000.00');
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it.each([0, 1, 2])('starts the workflow from call to action %i', async (index) => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(startButtons()[index]!);

    expect(heading('Set the project context')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
    expectCurrentStep(0);
    expect(screen.getByLabelText('Project name')).toHaveValue('');
  });

  it('returns from project details to the landing page without a name, keeping entries', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(startButtons()[0]!);
    await user.type(screen.getByLabelText(/Project manager/), 'A. Rahman');

    // No project name: going back is never blocked by validation.
    await user.click(screen.getByRole('button', { name: 'Back to home' }));

    expect(heading(LANDING_TITLE)).toBeInTheDocument();
    expect(screen.queryByText('Enter a project name.')).not.toBeInTheDocument();

    await user.click(startButtons()[0]!);
    expect(heading('Set the project context')).toBeInTheDocument();
    expect(screen.getByLabelText(/Project manager/)).toHaveValue('A. Rahman');
  });

  it('reopens the saved step instead of the landing page when work is in progress', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    await completeProjectStep(user);

    unmount();
    render(<App />);

    expect(heading('Enter the four EVA values')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create a project' })).not.toBeInTheDocument();
  });
});

describe('App', () => {
  it('renders the application shell and starts at project details', () => {
    renderApp();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('navigation', { name: 'Workflow' })).toBeInTheDocument();
    expect(heading('Set the project context')).toBeInTheDocument();
    expect(getStepItems()).toHaveLength(3);
    expectCurrentStep(0);
  });

  it('exposes a skip link that targets the main content', () => {
    renderApp();

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
  });

  it('requires a project name and focuses the field with an associated error', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));

    const name = screen.getByLabelText('Project name');
    expect(heading('Set the project context')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/Enter a project name\./);
    await waitFor(() => expect(name).toHaveFocus());

    await user.type(name, '   ');
    await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));
    expect(heading('Set the project context')).toBeInTheDocument();

    await user.type(name, 'Billing');
    expect(name).not.toHaveAttribute('aria-invalid');
  });

  it('moves focus to the main content after a step change', async () => {
    const user = userEvent.setup();
    renderApp();

    await completeProjectStep(user);

    expect(heading('Enter the four EVA values')).toBeInTheDocument();
    expectCurrentStep(1);
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('preserves project details and input drafts when navigating back and forward', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText(/Description/), 'Line one, "quoted"');
    await user.type(screen.getByLabelText(/Project manager/), 'A. Rahman');
    await completeProjectStep(user);
    await user.type(screen.getByLabelText(/Budget at Completion/), '1,000.50');
    await user.click(screen.getByRole('button', { name: 'Back to project details' }));

    expect(screen.getByLabelText('Project name')).toHaveValue('Billing platform');
    expect(screen.getByLabelText(/Description/)).toHaveValue('Line one, "quoted"');
    expect(screen.getByLabelText(/Project manager/)).toHaveValue('A. Rahman');

    await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));
    expect(screen.getByLabelText(/Budget at Completion/)).toHaveValue('1,000.50');
  });

  it('shows field errors on calculate and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    renderApp();

    await completeProjectStep(user);
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));

    const currency = screen.getByLabelText('Currency for all amounts');
    expect(currency).toHaveAccessibleDescription(/Select the currency used for all four values\./);
    await waitFor(() => expect(currency).toHaveFocus());

    for (const label of [/Budget at Completion/, /Planned Value/, /Earned Value/, /Actual Cost/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    }

    expect(heading('Enter the four EVA values')).toBeInTheDocument();
  });

  it('rejects PV and EV above BAC with the baseline explanation', async () => {
    const user = userEvent.setup();
    renderApp();

    await completeProjectStep(user);
    await fillInputs(user, { bac: '1000', pv: '1001', ev: '2000', ac: '5000' });
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));

    const pv = screen.getByLabelText(/Planned Value/);
    expect(pv).toHaveAccessibleDescription(
      /PV cannot exceed BAC under this application's baseline/,
    );
    expect(screen.getByLabelText(/Earned Value/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Actual Cost/)).not.toHaveAttribute('aria-invalid');
    await waitFor(() => expect(pv).toHaveFocus());
  });

  it('rejects malformed amounts without altering what was typed', async () => {
    const user = userEvent.setup();
    renderApp();

    await completeProjectStep(user);
    await fillInputs(user, { bac: '1e5', ac: '-5' });
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));

    expect(screen.getByLabelText(/Budget at Completion/)).toHaveValue('1e5');
    expect(screen.getByLabelText(/Budget at Completion/)).toHaveAccessibleDescription(
      /without exponential notation/,
    );
    expect(screen.getByLabelText(/Actual Cost/)).toHaveAccessibleDescription(
      /AC cannot be negative\./,
    );
  });

  it('accepts EV above PV, AC above BAC, and zero PV and AC', async () => {
    const user = userEvent.setup();
    renderApp();

    await completeProjectStep(user);
    await fillInputs(user, { bac: '1000', pv: '0', ev: '600', ac: '1500' });
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));

    expect(heading('Read the analysis')).toBeInTheDocument();
    expectCurrentStep(2);
  });

  it('shows confirmed inputs on the analysis step and allows editing them', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText(/Reporting date/), '2026-03-31');
    await completeProjectStep(user);
    await fillInputs(user);
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));

    expect(heading('Read the analysis')).toBeInTheDocument();
    expect(screen.getByText('March 31, 2026')).toBeInTheDocument();

    const values = screen.getByRole('region', { name: 'Confirmed EVA inputs' });
    expect(within(values).getByText('$100,000.00')).toBeInTheDocument();
    expect(within(values).getByText('$42,000.00')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);

    await user.click(screen.getByRole('button', { name: 'Edit EVA inputs' }));
    expect(heading('Enter the four EVA values')).toBeInTheDocument();
    expect(screen.getByLabelText(/Budget at Completion/)).toHaveValue('100,000');
  });

  it('labels a missing reporting date as not provided', async () => {
    const user = userEvent.setup();
    renderApp();

    await completeProjectStep(user);
    await fillInputs(user);
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));

    const overview = screen.getByRole('region', { name: 'Project overview' });
    expect(within(overview).getAllByText('Not provided')).toHaveLength(2);
  });

  it('restores the workflow from sessionStorage after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();

    await completeProjectStep(user);
    await fillInputs(user);
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
    expect(window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY)).toContain('Billing platform');

    unmount();
    renderApp();

    expect(heading('Read the analysis')).toBeInTheDocument();
    const inputs = screen.getByRole('region', { name: 'Confirmed EVA inputs' });
    expect(within(inputs).getByText('$35,000.00')).toBeInTheDocument();
  });
});

describe('Start a new analysis (FR-11)', () => {
  const resetButton = () => screen.getByRole('button', { name: 'Start a new analysis' });
  const dialog = () => screen.getByRole('alertdialog', { name: 'Start a new analysis?' });

  async function openAnalysis(user: UserEvent) {
    renderApp();
    await user.type(screen.getByLabelText('Project name'), 'Billing platform');
    await user.type(screen.getByLabelText(/Description/), 'Release two');
    await user.type(screen.getByLabelText(/Project manager/), 'A. Rahman');
    await user.type(screen.getByLabelText(/Reporting date/), '2026-03-31');
    await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));
    await fillInputs(user);
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
    expect(heading('Read the analysis')).toBeInTheDocument();
  }

  it('is offered only on the analysis step', async () => {
    const user = userEvent.setup();
    renderApp();
    const query = () => screen.queryByRole('button', { name: /reset|new analysis/i });

    expect(query()).not.toBeInTheDocument();
    await completeProjectStep(user);
    expect(query()).not.toBeInTheDocument();
    await fillInputs(user);
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
    expect(resetButton()).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('asks for confirmation first and explains what is discarded', async () => {
    const user = userEvent.setup();
    await openAnalysis(user);

    await user.click(resetButton());

    const confirm = dialog();
    expect(confirm).toHaveAttribute('aria-modal', 'true');
    expect(confirm).toHaveAccessibleDescription(
      'This clears everything entered in this browser tab and returns to the start page.',
    );
    expect(confirm).toHaveTextContent(
      'Project details: name, description, manager, and reporting date',
    );
    expect(confirm).toHaveTextContent('The currency and the BAC, PV, EV, and AC amounts');
    expect(confirm).toHaveTextContent('This report and its charts');
    expect(confirm).toHaveTextContent('cannot be undone');
    // Nothing is cleared yet, and focus starts on the safe choice.
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(heading('Read the analysis')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY)).toContain('Billing platform');
  });

  it('keeps every value when cancelled and returns focus to the action', async () => {
    const user = userEvent.setup();
    await openAnalysis(user);
    const before = window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY);

    await user.click(resetButton());
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(resetButton()).toHaveFocus();
    expect(heading('Read the analysis')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY)).toBe(before);

    await user.click(screen.getByRole('button', { name: 'Edit inputs' }));
    expect(screen.getByLabelText(/Actual Cost/)).toHaveValue('42000');
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByLabelText('Project name')).toHaveValue('Billing platform');
    expect(screen.getByLabelText(/Reporting date/)).toHaveValue('2026-03-31');
  });

  it('clears everything on confirmation and returns to the landing page', async () => {
    const user = userEvent.setup();
    await openAnalysis(user);

    await user.click(resetButton());
    await user.click(within(dialog()).getByRole('button', { name: 'Clear and start over' }));

    expect(heading(LANDING_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Workflow' })).not.toBeInTheDocument();

    // Starting again opens empty project details.
    await user.click(screen.getAllByRole('button', { name: 'Create a project' })[0]!);
    expect(heading('Set the project context')).toBeInTheDocument();
    expectCurrentStep(0);
    for (const label of ['Project name', /Description/, /Project manager/, /Reporting date/]) {
      expect(screen.getByLabelText(label)).toHaveValue('');
    }

    // The saved copy holds the empty state only.
    const saved = window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY) ?? '';
    expect(saved).not.toMatch(/Billing|Release|Rahman|2026-03-31|42000|USD/);
    expect(JSON.parse(saved)).toMatchObject({
      step: 'project',
      project: { name: '', description: '', manager: '', reportingDate: '' },
      inputDraft: { currency: '', bac: '', pv: '', ev: '', ac: '' },
      confirmed: null,
    });

    // The inputs are empty, and the analysis cannot be reached until new inputs are confirmed.
    await completeProjectStep(user, 'Next project');
    expect(screen.getByLabelText('Currency for all amounts')).toHaveValue('');
    for (const label of [/Budget at Completion/, /Planned Value/, /Earned Value/, /Actual Cost/]) {
      expect(screen.getByLabelText(label)).toHaveValue('');
    }
    expect(screen.queryByRole('button', { name: 'View last analysis' })).not.toBeInTheDocument();
  });

  it('does not bring the old analysis back after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    await completeProjectStep(user);
    await fillInputs(user);
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
    await user.click(resetButton());
    await user.click(within(dialog()).getByRole('button', { name: 'Clear and start over' }));

    unmount();
    render(<App />);
    expect(heading(LANDING_TITLE)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Create a project' })[0]!);
    expect(heading('Set the project context')).toBeInTheDocument();
    expect(screen.getByLabelText('Project name')).toHaveValue('');
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    await openAnalysis(user);

    resetButton().focus();
    await user.keyboard('{Enter}');
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(within(dialog()).getByRole('button', { name: 'Clear and start over' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(heading(LANDING_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
