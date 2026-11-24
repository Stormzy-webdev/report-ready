function cell(value) {
  let text = value == null ? '' : String(value);
  // Stop spreadsheet apps treating a cell as a formula (CSV injection).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// The BOM makes Excel open the file as UTF-8, so names like "Zoë" survive.
export function toCsv(columns, rows) {
  const lines = [columns, ...rows.map((row) => columns.map((c) => row[c]))];
  return '﻿' + lines.map((line) => line.map(cell).join(',')).join('\r\n') + '\r\n';
}
