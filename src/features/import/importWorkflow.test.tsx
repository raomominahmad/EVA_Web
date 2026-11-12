import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WORKFLOW_STORAGE_KEY } from '@/app/workflow/workflowStorage';
import { buildXlsx } from '@/test/fixtures/xlsx';
import { checkImportFile } from './checkImportFile';
import { processImportFile } from './processImportFile';
import type * as RunImportModule from './runImport';
import { renderApp } from '@/test/renderApp';

// jsdom has no Worker. The same pipeline runs in-process here; worker termination and the
// timeout are covered by runImport.test.ts and the browser tests.
vi.mock('./runImport', async (importOriginal) => {
  const original = await importOriginal<typeof RunImportModule>();
  return {
    ...original,
    runImport: async (file: File) => {
      const check = checkImportFile(file);
      if (!check.ok) return check;
      return processImportFile(check.kind, await file.arrayBuffer(), file.name);
    },
  };
});

const CSV = [
  'Currency,BAC,PV,EV,AC,Notes',
  'EUR,"250,000",100000,90000,110000,Baseline',
  'EUR,250000,300000,90000,110000,Over budget plan',
  'EUR,250000,120000,125000,99000,Latest',
].join('\r\n');

function csvFile(text = CSV, name = 'costs.csv') {
  return new File([text], name, { type: 'text/csv' });
}

function storedState() {
  return JSON.parse(sessionStorage.getItem(WORKFLOW_STORAGE_KEY) ?? 'null') as {
    project: { name: string };
    confirmed: { currency: string; inputs: Record<string, number> } | null;
  };
}

async function goToInputs(user: UserEvent) {
  renderApp();
  await user.type(screen.getByLabelText('Project name'), 'Billing platform');
  await user.type(screen.getByLabelText(/Project manager/), 'A. Rahman');
  await user.click(screen.getByRole('button', { name: 'Continue to EVA inputs' }));
}

async function openAndUpload(user: UserEvent, file: File) {
  await user.click(screen.getByRole('button', { name: 'Import from file' }));
  const panel = screen.getByRole('region', { name: 'Import from file' });
  await user.upload(within(panel).getByLabelText(/Choose file/), file);
  return panel;
}

function amountInputs() {
  return [/Budget at Completion/, /Planned Value/, /Earned Value/, /Actual Cost/].map(
    (label) => screen.getByLabelText<HTMLInputElement>(label).value,
  );
}

describe('Import from file', () => {
  it('opens as a region, moves focus to its heading, and exposes its state', async () => {
    const user = userEvent.setup();
    await goToInputs(user);
    const toggle = screen.getByRole('button', { name: 'Import from file' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Import from file' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Use these values' })).toBeDisabled();
  });

  it('previews rows, blocks invalid rows, and imports only the selected valid row', async () => {
    const user = userEvent.setup();
    await goToInputs(user);
    const panel = await openAndUpload(user, csvFile());

    const table = await within(panel).findByRole('table', { name: /Rows in costs\.csv/ });
    expect(within(panel).getByText('Ignored columns: Notes')).toBeInTheDocument();

    const row2 = within(table).getByRole('radio', { name: 'Row 2' });
    const row3 = within(table).getByRole('radio', { name: 'Row 3' });
    const row4 = within(table).getByRole('radio', { name: 'Row 4' });
    expect(row3).toBeDisabled();
    expect(row2).not.toBeChecked();
    expect(row4).not.toBeChecked();

    // The invalid cell is marked in text and linked from the summary.
    const summaryLink = within(panel).getByRole('link', {
      name: "Row 3, PV: PV cannot exceed BAC under this application's baseline assumptions.",
    });
    const invalidCell = within(table).getByText('300000').closest('td');
    expect(invalidCell).toHaveAccessibleDescription(summaryLink.textContent);
    expect(invalidCell).toHaveTextContent('Error: 300000');
    await user.click(summaryLink);
    expect(invalidCell).toHaveFocus();

    const confirm = within(panel).getByRole('button', { name: 'Use these values' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription('Select a valid row to continue.');

    await user.click(row4);
    const selected = within(panel).getByRole('heading', { name: 'Values to import from row 4' });
    expect(selected.parentElement).toHaveTextContent('EUR');
    expect(confirm).toBeEnabled();

    await user.click(confirm);

    expect(screen.queryByRole('region', { name: 'Import from file' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Currency for all amounts')).toHaveValue('EUR');
    expect(amountInputs()).toEqual(['250000', '120000', '125000', '99000']);
    expect(screen.getByLabelText('Currency for all amounts')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Imported row 4 from costs.csv. Review the values, then choose “Calculate analysis”.',
    );

    // Project details are untouched, and imported values remain editable.
    expect(storedState().project.name).toBe('Billing platform');
    await user.clear(screen.getByLabelText(/Actual Cost/));
    await user.type(screen.getByLabelText(/Actual Cost/), '98000');
    expect(amountInputs()[3]).toBe('98000');
  });

  it('preselects the only valid row and keeps the form currency when the file has none', async () => {
    const user = userEvent.setup();
    await goToInputs(user);
    await user.selectOptions(screen.getByLabelText('Currency for all amounts'), 'GBP');

    const panel = await openAndUpload(user, csvFile('BAC,PV,EV,AC\n1000,400,350,420\n', 'one.csv'));
    expect(await within(panel).findByRole('radio', { name: 'Row 2' })).toBeChecked();
    expect(within(panel).getByText('Not in the file; keeps GBP')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Use these values' }));
    expect(screen.getByLabelText('Currency for all amounts')).toHaveValue('GBP');
    expect(amountInputs()).toEqual(['1000', '400', '350', '420']);
  });

  it('cancelling changes nothing and returns focus to the import button', async () => {
    const user = userEvent.setup();
    await goToInputs(user);
    await user.type(screen.getByLabelText(/Budget at Completion/), '5000');

    const panel = await openAndUpload(user, csvFile());
    await user.click(await within(panel).findByRole('radio', { name: 'Row 2' }));
    await user.click(within(panel).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('region', { name: 'Import from file' })).not.toBeInTheDocument();
    expect(amountInputs()).toEqual(['5000', '', '', '']);
    expect(screen.getByLabelText('Currency for all amounts')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Import from file' })).toHaveFocus();
  });

  it('shows file-level errors in a focused alert without changing the form', async () => {
    const user = userEvent.setup({ applyAccept: false });
    await goToInputs(user);

    let panel = await openAndUpload(user, new File(['x'], 'notes.txt', { type: 'text/plain' }));
    let alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent('This file cannot be imported');
    expect(alert).toHaveFocus();

    await user.upload(
      within(panel).getByLabelText(/Choose a different file/),
      csvFile('Currency,BAC,PV\nUSD,1,1\n'),
    );
    alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent('Required columns are missing: EV, AC.');
    expect(within(panel).queryByRole('table', { name: /Rows in/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Use these values' })).toBeDisabled();

    await user.click(within(panel).getByRole('button', { name: 'Cancel' }));
    panel = await openAndUpload(user, csvFile('BAC,PV,EV,AC\n0,0,0,0\n'));
    expect(
      await within(panel).findByText(
        'No row in this file can be imported. Correct the file and choose it again.',
      ),
    ).toBeInTheDocument();
    expect(amountInputs()).toEqual(['', '', '', '']);
  });

  it('imports from an Excel workbook, using the first worksheet', async () => {
    const user = userEvent.setup();
    await goToInputs(user);
    const workbook = buildXlsx([
      {
        name: 'March',
        rows: [
          ['Currency', 'Budget at Completion', 'Planned Value', 'Earned Value', 'Actual Cost'],
          ['USD', 100000, { formula: 'B2*0.4', cached: 40000 }, 35000, 42000.5],
        ],
      },
      { name: 'Old', rows: [['BAC'], [1]] },
    ]);
    const file = new File([workbook.slice()], 'march.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const panel = await openAndUpload(user, file);
    expect(
      await within(panel).findByRole('table', { name: 'Rows in march.xlsx, worksheet “March”' }),
    ).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Use these values' }));
    expect(amountInputs()).toEqual(['100000', '40000', '35000', '42000.5']);
  });

  it('never changes an existing analysis until the user calculates again', async () => {
    const user = userEvent.setup();
    await goToInputs(user);
    await user.selectOptions(screen.getByLabelText('Currency for all amounts'), 'USD');
    for (const [label, value] of [
      [/Budget at Completion/, '1000'],
      [/Planned Value/, '500'],
      [/Earned Value/, '400'],
      [/Actual Cost/, '450'],
    ] as const) {
      await user.type(screen.getByLabelText(label), value);
    }
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
    await screen.findByRole('heading', { level: 1, name: 'Read the analysis' });
    const before = storedState().confirmed;

    await user.click(screen.getByRole('button', { name: 'Edit EVA inputs' }));
    const panel = await openAndUpload(user, csvFile());
    await user.click(await within(panel).findByRole('radio', { name: 'Row 2' }));
    expect(
      within(panel).getByText(/Your current analysis keeps its values until you choose/),
    ).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Use these values' }));

    expect(storedState().confirmed).toEqual(before);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Enter the four EVA values' }),
    ).toBeVisible();

    // The imported values pass the same validation as typed values.
    await user.click(screen.getByRole('button', { name: 'Calculate analysis' }));
    await screen.findByRole('heading', { level: 1, name: 'Read the analysis' });
    await waitFor(() =>
      expect(storedState().confirmed).toEqual({
        currency: 'EUR',
        inputs: { bac: 250000, pv: 100000, ev: 90000, ac: 110000 },
      }),
    );
  });
});
