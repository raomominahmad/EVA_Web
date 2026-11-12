/**
 * Saves CSV text as a UTF-8 file. A byte-order mark is added so that spreadsheet applications
 * detect UTF-8 and show characters such as “−”, “€”, and accented names correctly.
 */
export function downloadCsv(content: string, fileName: string): void {
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled, so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
