// Builds a CSV file from rows and triggers a download in the browser.
// Values are quoted, and cells starting with = + - @ are prefixed with
// ' so a spreadsheet never evaluates attendee-supplied text as a formula.
function cell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(columns, rows) {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(c.value(row))).join(','));
  return [header, ...body].join('\r\n');
}

export function downloadCsv(filename, columns, rows) {
  // BOM so Excel opens UTF-8 names (e.g. Devanagari) correctly.
  const blob = new Blob(['﻿', toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const ATTENDEE_CSV_COLUMNS = [
  { label: 'Attendee', value: (t) => t.attendeeName },
  { label: 'Email', value: (t) => t.customerEmail },
  { label: 'Phone', value: (t) => t.customerPhone },
  { label: 'Event', value: (t) => t.eventName },
  { label: 'Ticket type', value: (t) => t.tierName },
  { label: 'Booking reference', value: (t) => t.bookingReference },
  { label: 'Status', value: (t) => t.status },
  { label: 'Checked in at', value: (t) => t.checkedInAt || '' },
];
