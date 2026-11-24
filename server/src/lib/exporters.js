import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { toCsv } from './csv.js';

// rows: [{ learner_code, first_name, initial, comment }] in the order they should appear.
// initial is set only when two learners share a first name ("Thandi M.").
// meta: { className, grade, year, term }

const displayName = (row) => (row.initial ? `${row.first_name} ${row.initial}.` : row.first_name);

export const FORMATS = {
  csv: { ext: 'csv', type: 'text/csv; charset=utf-8', build: buildCsv },
  xlsx: { ext: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', build: buildXlsx },
  docx: { ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', build: buildDocx },
};

function title({ className, grade, term, year }) {
  return `Class ${className} (Grade ${grade}), term ${term} ${year}: report comments`;
}

async function buildCsv(rows) {
  return Buffer.from(toCsv(['learner_code', 'first_name', 'initial', 'comment'], rows));
}

async function buildXlsx(rows, meta) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Term ${meta.term} comments`);
  sheet.columns = [
    { header: 'Learner code', key: 'learner_code', width: 14 },
    { header: 'First name', key: 'first_name', width: 18 },
    { header: 'Surname initial', key: 'initial', width: 15 },
    { header: 'Comment', key: 'comment', width: 90 },
  ];
  sheet.addRows(rows.map((r) => ({ ...r, initial: r.initial ?? '' })));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2EC' } };
  sheet.getColumn('comment').alignment = { wrapText: true, vertical: 'top' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildDocx(rows, meta) {
  const children = [
    new Paragraph({ text: title(meta), heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: `${rows.length} approved comments`, italics: true, color: '6B7A73' })] }),
  ];
  for (const row of rows) {
    children.push(
      new Paragraph({
        spacing: { before: 280, after: 60 },
        children: [
          new TextRun({ text: displayName(row), bold: true }),
          new TextRun({ text: `  ${row.learner_code}`, color: '6B7A73', size: 18 }),
        ],
      }),
      new Paragraph({ text: row.comment, spacing: { after: 120 } }),
    );
  }
  const doc = new Document({
    creator: 'ReportReady',
    title: title(meta),
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
