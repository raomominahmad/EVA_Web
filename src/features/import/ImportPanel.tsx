import { Check, CircleAlert, FileSpreadsheet } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent, RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { EVA_INPUT_DEFINITIONS, EVA_INPUT_FIELDS } from '@/domain/evaTypes';
import { IMPORT_ACCEPT } from './checkImportFile';
import { IMPORT_LIMITS } from './importLimits';
import type { ImportField, ImportFileError, ImportPreview, ImportRow } from './importTypes';
import { FIELD_LABELS } from './interpretSheet';
import { ImportAbortedError, runImport } from './runImport';
import styles from './ImportPanel.module.css';

/** The currency and amounts of the confirmed row, as text for the form. */
export interface ImportedValues {
  currency?: string;
  bac: string;
  pv: string;
  ev: string;
  ac: string;
}

export interface ImportConfirmation {
  values: ImportedValues;
  fileName: string;
  rowNumber: number;
}

interface ImportPanelProps {
  id: string;
  /** Receives focus when the panel opens. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  currentCurrency: string;
  hasAnalysis: boolean;
  onConfirm: (confirmation: ImportConfirmation) => void;
  onCancel: () => void;
}

interface ChosenFile {
  name: string;
  size: number;
}

type PanelState =
  | { status: 'idle' }
  | { status: 'reading'; file: ChosenFile }
  | { status: 'error'; file: ChosenFile; error: ImportFileError }
  | { status: 'preview'; file: ChosenFile; preview: ImportPreview; selected: number | null };

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function cellId(prefix: string, row: number, field: ImportField) {
  return `${prefix}-r${row}-${field}`;
}

function errorId(prefix: string, row: number, index: number) {
  return `${prefix}-e${row}-${index}`;
}

export function ImportPanel({
  id,
  headingRef,
  currentCurrency,
  hasAnalysis,
  onConfirm,
  onCancel,
}: ImportPanelProps) {
  const prefix = useId();
  const inputId = `${prefix}-file`;
  const [state, setState] = useState<PanelState>({ status: 'idle' });
  const [announcement, setAnnouncement] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    return () => abortRef.current?.abort();
  }, [headingRef]);

  useEffect(() => {
    if (state.status === 'error') alertRef.current?.focus();
  }, [state]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clearing the control lets the same file be chosen again after it is corrected.
    event.target.value = '';
    if (!file) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const chosen = { name: file.name, size: file.size };
    setState({ status: 'reading', file: chosen });
    setAnnouncement(`Reading ${file.name}…`);

    try {
      const result = await runImport(file, { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (!result.ok) {
        setState({ status: 'error', file: chosen, error: result.error });
        setAnnouncement('');
        return;
      }

      const validRows = result.preview.rows.filter((row) => row.errors.length === 0);
      const onlyValid = validRows.length === 1 ? (validRows[0]?.rowNumber ?? null) : null;
      setState({ status: 'preview', file: chosen, preview: result.preview, selected: onlyValid });
      setAnnouncement(
        `Read ${plural(result.preview.rows.length, 'data row')} from ${file.name}. ` +
          `${plural(validRows.length, 'row')} can be imported.` +
          (onlyValid === null ? '' : ` Row ${onlyValid} is selected.`),
      );
    } catch (error) {
      if (error instanceof ImportAbortedError) return;
      setState({
        status: 'error',
        file: chosen,
        error: { code: 'unreadable', message: 'The file could not be read.' },
      });
    }
  }

  function confirm() {
    if (state.status !== 'preview' || state.selected === null) return;
    const row = state.preview.rows.find((item) => item.rowNumber === state.selected);
    if (!row || row.errors.length > 0) return;
    const { currency, bac, pv, ev, ac } = row.draft;
    onConfirm({
      values: currency === undefined ? { bac, pv, ev, ac } : { currency, bac, pv, ev, ac },
      fileName: state.preview.fileName,
      rowNumber: row.rowNumber,
    });
  }

  const file = state.status === 'idle' ? null : state.file;

  return (
    <section id={id} className={styles.panel} aria-labelledby={`${prefix}-heading`}>
      <div className={styles.header}>
        <h2 id={`${prefix}-heading`} ref={headingRef} tabIndex={-1} className={styles.title}>
          Import from file
        </h2>
        <p className={styles.lead}>
          Fill the currency and the four amounts from one row of a CSV or Excel file. Project
          details are not imported, and nothing changes until you choose “Use these values”.
        </p>
      </div>

      <div className={styles.requirements}>
        <ul className={styles.facts}>
          <li>
            File types: <strong>.csv</strong> (UTF-8) or <strong>.xlsx</strong>; only the first
            worksheet is read.
          </li>
          <li>
            Size: 1 MiB (1,048,576 bytes) or smaller, with at most {IMPORT_LIMITS.maxDataRows} data
            rows.
          </li>
          <li>
            Header row with columns BAC, PV, EV, and AC (or their full names). Currency is optional;
            other columns are ignored.
          </li>
        </ul>
        {/* Focusable so keyboard users can scroll the example on narrow screens. */}
        <div
          className={styles.exampleWrap}
          role="region"
          aria-labelledby={`${prefix}-example`}
          tabIndex={0}
        >
          <table className={styles.example}>
            <caption id={`${prefix}-example`} className={styles.exampleCaption}>
              Example file layout
            </caption>
            <thead>
              <tr>
                <th scope="col">Currency</th>
                <th scope="col">BAC</th>
                <th scope="col">PV</th>
                <th scope="col">EV</th>
                <th scope="col">AC</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>USD</td>
                <td className="numeric">100000</td>
                <td className="numeric">40000</td>
                <td className="numeric">35000</td>
                <td className="numeric">42000</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.picker}>
        <input
          id={inputId}
          type="file"
          accept={IMPORT_ACCEPT}
          className={`visually-hidden ${styles.fileInput}`}
          onChange={(event) => void handleFile(event)}
        />
        <label htmlFor={inputId} className={styles.fileButton}>
          <FileSpreadsheet size={16} strokeWidth={2} aria-hidden="true" />
          {file ? 'Choose a different file' : 'Choose file'}
        </label>
        {file ? (
          <p className={styles.fileName}>
            <span className={styles.fileNameText}>{file.name}</span>{' '}
            <span className={styles.fileSize}>({formatFileSize(file.size)})</span>
          </p>
        ) : (
          <p className={styles.fileName}>No file chosen.</p>
        )}
      </div>

      <p className={styles.status} role="status" aria-live="polite">
        {announcement}
      </p>

      {state.status === 'error' ? (
        <div ref={alertRef} className={styles.alert} role="alert" tabIndex={-1}>
          <CircleAlert size={20} strokeWidth={2} aria-hidden="true" className={styles.alertIcon} />
          <div>
            <p className={styles.alertTitle}>This file cannot be imported</p>
            <p>{state.error.message}</p>
          </div>
        </div>
      ) : null}

      {state.status === 'preview' ? (
        <PreviewSection
          prefix={prefix}
          preview={state.preview}
          selected={state.selected}
          onSelect={(rowNumber) => setState({ ...state, selected: rowNumber })}
          currentCurrency={currentCurrency}
          hasAnalysis={hasAnalysis}
        />
      ) : null}

      <ImportActions state={state} prefix={prefix} onConfirm={confirm} onCancel={onCancel} />
    </section>
  );
}

function ImportActions({
  state,
  prefix,
  onConfirm,
  onCancel,
}: {
  state: PanelState;
  prefix: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reasonId = `${prefix}-reason`;
  let reason = '';
  let ready = false;

  if (state.status === 'idle') reason = 'Choose a file to see its rows.';
  else if (state.status === 'reading') reason = 'Reading the file…';
  else if (state.status === 'error') reason = 'Choose a different file to continue.';
  else if (!state.preview.rows.some((row) => row.errors.length === 0)) {
    reason = 'No row in this file can be imported. Correct the file and choose it again.';
  } else if (state.selected === null) reason = 'Select a valid row to continue.';
  else ready = true;

  return (
    <div className={styles.actions}>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <div className={styles.confirmGroup}>
        {reason ? (
          <p id={reasonId} className={styles.reason}>
            {reason}
          </p>
        ) : null}
        <Button
          onClick={onConfirm}
          disabled={!ready}
          aria-describedby={reason ? reasonId : undefined}
        >
          Use these values
        </Button>
      </div>
    </div>
  );
}

interface PreviewSectionProps {
  prefix: string;
  preview: ImportPreview;
  selected: number | null;
  onSelect: (rowNumber: number) => void;
  currentCurrency: string;
  hasAnalysis: boolean;
}

function PreviewSection({
  prefix,
  preview,
  selected,
  onSelect,
  currentCurrency,
  hasAnalysis,
}: PreviewSectionProps) {
  const headerOf = new Map(preview.columns.map((column) => [column.field, column.header]));
  const rowsWithErrors = preview.rows.filter((row) => row.errors.length > 0);
  const selectedRow = preview.rows.find((row) => row.rowNumber === selected) ?? null;
  const summaryId = `${prefix}-summary`;

  function focusTarget(event: MouseEvent<HTMLAnchorElement>, targetId: string) {
    event.preventDefault();
    // Focusing also scrolls the cell into view inside the table's scroll container.
    document.getElementById(targetId)?.focus();
  }

  function errorTarget(row: ImportRow, field: ImportField | null) {
    return field ? cellId(prefix, row.rowNumber, field) : `${prefix}-row-${row.rowNumber}`;
  }

  return (
    <div className={styles.preview}>
      {rowsWithErrors.length > 0 ? (
        <div className={styles.errorSummary} aria-labelledby={summaryId} role="region">
          <p id={summaryId} className={styles.errorSummaryTitle}>
            <CircleAlert size={16} strokeWidth={2} aria-hidden="true" />
            {plural(rowsWithErrors.length, 'row')} cannot be imported
          </p>
          <ul>
            {rowsWithErrors.flatMap((row) =>
              row.errors.map((error, index) => {
                const column = error.field
                  ? (headerOf.get(error.field) ?? FIELD_LABELS[error.field])
                  : null;
                return (
                  <li key={errorId(prefix, row.rowNumber, index)}>
                    <a
                      id={errorId(prefix, row.rowNumber, index)}
                      href={`#${errorTarget(row, error.field)}`}
                      onClick={(event) => focusTarget(event, errorTarget(row, error.field))}
                    >
                      Row {row.rowNumber}
                      {column ? `, ${column}` : ''}: {error.message}
                    </a>
                  </li>
                );
              }),
            )}
          </ul>
        </div>
      ) : null}

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className={styles.caption}>
            {preview.fileKind === 'xlsx' && preview.sheetName ? (
              <>
                Rows in <span className={styles.captionName}>{preview.fileName}</span>, worksheet “
                {preview.sheetName}”
              </>
            ) : (
              <>
                Rows in <span className={styles.captionName}>{preview.fileName}</span>
              </>
            )}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.rowHeaderCol}>
                Row
              </th>
              <th scope="col">Status</th>
              {preview.columns.map((column) => (
                <th
                  key={column.field}
                  scope="col"
                  className={column.field === 'currency' ? undefined : styles.amountHeader}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const valid = row.errors.length === 0;
              const isSelected = row.rowNumber === selected;
              const radioId = `${prefix}-row-${row.rowNumber}`;
              return (
                <tr key={row.rowNumber} className={isSelected ? styles.selectedRow : undefined}>
                  <th scope="row" className={styles.rowHeader}>
                    <label className={styles.rowLabel} htmlFor={radioId}>
                      <input
                        id={radioId}
                        type="radio"
                        name={`${prefix}-row`}
                        value={row.rowNumber}
                        checked={isSelected}
                        disabled={!valid}
                        onChange={() => onSelect(row.rowNumber)}
                        className={styles.radio}
                      />
                      <span>
                        <span className="visually-hidden">Row</span> {row.rowNumber}
                      </span>
                    </label>
                  </th>
                  <td>
                    {valid ? (
                      <span className={styles.valid}>
                        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                        Valid
                      </span>
                    ) : (
                      <span className={styles.invalid}>
                        <CircleAlert size={14} strokeWidth={2} aria-hidden="true" />
                        {plural(row.errors.length, 'error')}
                      </span>
                    )}
                  </td>
                  {preview.columns.map((column) => {
                    const fieldErrors = row.errors
                      .map((error, index) => ({ error, index }))
                      .filter(({ error }) => error.field === column.field);
                    const value = row.values[column.field];
                    const className = [
                      column.field === 'currency' ? undefined : styles.amount,
                      fieldErrors.length > 0 ? styles.cellError : undefined,
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <td
                        key={column.field}
                        id={cellId(prefix, row.rowNumber, column.field)}
                        className={className || undefined}
                        tabIndex={fieldErrors.length > 0 ? -1 : undefined}
                        aria-describedby={
                          fieldErrors.length > 0
                            ? fieldErrors
                                .map(({ index }) => errorId(prefix, row.rowNumber, index))
                                .join(' ')
                            : undefined
                        }
                      >
                        {fieldErrors.length > 0 ? (
                          <>
                            <CircleAlert
                              size={14}
                              strokeWidth={2}
                              aria-hidden="true"
                              className={styles.cellErrorIcon}
                            />
                            <span className="visually-hidden">Error: </span>
                          </>
                        ) : null}
                        {value === '' ? <span className={styles.blank}>(blank)</span> : value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview.ignoredColumns.length > 0 ? (
        <p className={styles.ignored}>Ignored columns: {preview.ignoredColumns.join(', ')}</p>
      ) : null}

      {selectedRow ? (
        <SelectedValues
          row={selectedRow}
          currentCurrency={currentCurrency}
          hasAnalysis={hasAnalysis}
        />
      ) : null}
    </div>
  );
}

function SelectedValues({
  row,
  currentCurrency,
  hasAnalysis,
}: {
  row: ImportRow;
  currentCurrency: string;
  hasAnalysis: boolean;
}) {
  const fileCurrency = row.draft.currency;
  let currencyText: string;
  if (fileCurrency !== undefined) {
    currencyText =
      currentCurrency && currentCurrency !== fileCurrency
        ? `${fileCurrency} (replaces ${currentCurrency})`
        : fileCurrency;
  } else {
    currencyText = currentCurrency
      ? `Not in the file; keeps ${currentCurrency}`
      : 'Not in the file; select it in the form';
  }

  return (
    <div className={styles.selected}>
      <h3 className={styles.selectedTitle}>Values to import from row {row.rowNumber}</h3>
      <dl className={styles.values}>
        <div>
          <dt>Currency</dt>
          <dd>{currencyText}</dd>
        </div>
        {EVA_INPUT_FIELDS.map((field) => (
          <div key={field}>
            <dt>
              <abbr title={EVA_INPUT_DEFINITIONS[field].name}>
                {EVA_INPUT_DEFINITIONS[field].symbol}
              </abbr>
            </dt>
            <dd className="numeric">{row.draft[field]}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>
        These values replace the currency and amounts in the form. Project details are not changed.
        {hasAnalysis
          ? ' Your current analysis keeps its values until you choose “Calculate analysis” again.'
          : ''}
      </p>
    </div>
  );
}
