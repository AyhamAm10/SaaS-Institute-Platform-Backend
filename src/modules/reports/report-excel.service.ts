import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Currency } from '@prisma/client';
import { Cell, ColumnKind, ReportBlock, ReportDocument, ReportRow } from './document/report-document';

const MONEY_FORMATS: Record<Currency, string> = {
  SYP: '#,##0" ل.س"',
  USD: '#,##0.00" $"',
};

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F5' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E6' } };
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFDEE2E6' } },
  bottom: { style: 'thin', color: { argb: 'FFDEE2E6' } },
  left: { style: 'thin', color: { argb: 'FFDEE2E6' } },
  right: { style: 'thin', color: { argb: 'FFDEE2E6' } },
};

/**
 * Report document → Excel workbook (D3). Same document as the screen: one
 * right-to-left sheet, typed cells (money with its currency format, dates,
 * percentages) so the numbers stay usable in Excel.
 */
@Injectable()
export class ReportExcelService {
  async toBuffer(doc: ReportDocument, instituteName: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = instituteName;
    workbook.created = new Date(doc.generatedAt);
    const sheet = workbook.addWorksheet(doc.title.slice(0, 31), {
      views: [{ rightToLeft: true }],
      pageSetup: { orientation: doc.orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const width = Math.max(4, ...doc.blocks.map(blockWidth));
    this.title(sheet, instituteName, width, 14, true);
    this.title(sheet, doc.title, width, 13, true);
    if (doc.subtitle) this.title(sheet, doc.subtitle, width, 10, false);
    for (const m of doc.meta) sheet.addRow([m.label, m.value]).getCell(1).font = { bold: true };
    if (doc.verification) sheet.addRow(['رقم المستند', doc.verification.number]).getCell(1).font = { bold: true };
    sheet.addRow([]);

    for (const block of doc.blocks) {
      this.block(sheet, block);
      sheet.addRow([]);
    }
    sheet.columns.forEach((col, i) => (col.width = i === 0 ? 28 : 18));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private title(sheet: ExcelJS.Worksheet, text: string, width: number, size: number, bold: boolean) {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, width);
    row.getCell(1).font = { size, bold };
    row.getCell(1).alignment = { horizontal: 'center' };
  }

  private block(sheet: ExcelJS.Worksheet, block: ReportBlock) {
    switch (block.type) {
      case 'stats':
      case 'fields':
        if (block.title) sheet.addRow([block.title]).font = { bold: true };
        for (const item of block.items) {
          const row = sheet.addRow([item.label]);
          row.getCell(1).font = { bold: true };
          writeCell(row.getCell(2), item.value, kindOf(item.value));
        }
        return;
      case 'table': {
        if (block.title) sheet.addRow([block.title]).font = { bold: true, size: 12 };
        this.header(sheet, block.columns.map((c) => c.title));
        const writeRow = (data: ReportRow, total: boolean) => {
          const row = sheet.addRow([]);
          block.columns.forEach((col, i) => {
            const cell = row.getCell(i + 1);
            writeCell(cell, data[col.key] ?? null, col.kind);
            cell.border = BORDER;
            if (total) {
              cell.font = { bold: true };
              cell.fill = TOTAL_FILL;
            }
          });
        };
        if (block.rows.length === 0 && block.emptyText) sheet.addRow([block.emptyText]);
        block.rows.forEach((r) => writeRow(r, false));
        block.totals?.forEach((r) => writeRow(r, true));
        return;
      }
      case 'grid':
        if (block.title) sheet.addRow([block.title]).font = { bold: true, size: 12 };
        this.header(sheet, [block.corner, ...block.columns.map((c) => c.replaceAll('\n', ' '))]);
        for (const r of block.rows) {
          const row = sheet.addRow([r.sub ? `${r.label} – ${r.sub}` : r.label, ...r.cells.map((c) => c?.replaceAll('\n', ' / ') ?? '')]);
          row.eachCell({ includeEmpty: true }, (cell) => (cell.border = BORDER));
          row.getCell(1).font = { bold: true };
        }
        return;
      case 'bars':
        if (block.title) sheet.addRow([block.title]).font = { bold: true, size: 12 };
        for (const bar of block.items) {
          const row = sheet.addRow([bar.label, bar.value / 100, bar.caption ?? '']);
          row.getCell(2).numFmt = '0.0%';
        }
        return;
      case 'note':
        sheet.addRow([block.text]).font = { italic: true };
        return;
      case 'signatures':
        sheet.addRow(block.items.map((s) => `${s}: ..........`));
        return;
    }
  }

  private header(sheet: ExcelJS.Worksheet, titles: string[]) {
    const row = sheet.addRow(titles);
    row.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.border = BORDER;
      cell.alignment = { horizontal: 'center', wrapText: true };
    });
  }
}

function blockWidth(block: ReportBlock): number {
  if (block.type === 'table') return block.columns.length;
  if (block.type === 'grid') return block.columns.length + 1;
  return 3;
}

function kindOf(value: Cell): ColumnKind {
  if (value && typeof value === 'object') return 'amount' in value ? 'money' : 'badge';
  return typeof value === 'number' ? 'number' : 'text';
}

/** Typed value → Excel cell (money with its currency format, % as a fraction). */
function writeCell(cell: ExcelJS.Cell, value: Cell, kind: ColumnKind) {
  if (value === null || kind === 'blank') {
    cell.value = '';
    return;
  }
  if (typeof value === 'object') {
    if ('amount' in value) {
      cell.value = value.amount;
      cell.numFmt = MONEY_FORMATS[value.currency];
    } else {
      cell.value = value.text;
    }
    return;
  }
  if (kind === 'percent' && typeof value === 'number') {
    cell.value = value / 100;
    cell.numFmt = '0.0%';
    return;
  }
  if (kind === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    cell.value = new Date(`${value}T00:00:00Z`);
    cell.numFmt = 'yyyy/mm/dd';
    return;
  }
  cell.value = value;
}
