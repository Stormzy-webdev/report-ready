import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';

const MAX_ROWS = 500;
const MAX_COLS = 60;

export class SheetError extends Error {}

// Reads an uploaded .xlsx or .csv into plain grids of text, one per sheet:
// [{ name, rows: string[][] }]. Mapping columns to learners and marks
// happens in the browser, so any layout a teacher uses can be imported.
export async function readSheets(buffer, filename = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xls')) {
    throw new SheetError('This is an old-style .xls file. In Excel, use File → Save As → Excel Workbook (.xlsx).');
  }
  if (lower.endsWith('.xlsx')) return readXlsx(buffer);
  return [{ name: 'Sheet 1', rows: trimGrid(readCsv(buffer)) }];
}

function readCsv(buffer) {
  try {
    return parse(buffer, { bom: true, relax_column_count: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new SheetError(`Could not read the CSV: ${err.message}`);
  }
}

async function readXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new SheetError('Could not open this Excel file. Is it password-protected or damaged?');
  }
  const sheets = [];
  workbook.eachSheet((sheet) => {
    if (sheet.state && sheet.state !== 'visible') return;
    const rows = [];
    const cols = Math.min(sheet.columnCount, MAX_COLS);
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber > MAX_ROWS) return;
      const cells = [];
      for (let c = 1; c <= cols; c++) cells.push(cellText(row.getCell(c)));
      rows[rowNumber - 1] = cells;
    });
    const grid = trimGrid(Array.from(rows, (r) => r ?? []));
    if (grid.length) sheets.push({ name: sheet.name, rows: grid });
  });
  if (sheets.length === 0) throw new SheetError('The file has no data in it.');
  return sheets;
}

// Formula cells give their calculated result; numbers stay unformatted so
// "45.5" isn't shown as "46" because of cell formatting.
function cellText(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'result' in v) return v.result == null ? '' : String(v.result);
  return String(cell.text ?? '').trim();
}

// Drops empty rows at the end and empty columns on the right.
function trimGrid(rows) {
  const clean = rows.map((r) => r.map((c) => String(c ?? '').trim()));
  while (clean.length && clean.at(-1).every((c) => !c)) clean.pop();
  const width = Math.max(0, ...clean.map((r) => r.findLastIndex((c) => c) + 1));
  return clean.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}
