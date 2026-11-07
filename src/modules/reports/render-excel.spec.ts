import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RenderReportExcelDto } from './dto/render-report-excel.dto';
import { ReportExcelService } from './report-excel.service';
import type { ReportBlock, ReportDocument } from './document/report-document';
import { REPORT_ROW_LIMIT } from './reports.rules';

describe('POST /reports/render/excel validation and rendering', () => {
  const excelService = new ReportExcelService();

  function makeValidDoc(): ReportDocument {
    return {
      key: 'selection',
      title: 'السجلات المحددة',
      orientation: 'portrait',
      meta: [{ label: 'عدد السجلات', value: '2' }],
      blocks: [
        {
          type: 'table',
          title: 'جدول الطلاب',
          columns: [
            { key: 'name', title: 'الاسم', kind: 'text' },
            { key: 'phone', title: 'الهاتف', kind: 'phone' },
          ],
          rows: [
            { name: 'أحمد علي', phone: '0912345678' },
            { name: 'سارة خالد', phone: '0987654321' },
          ],
        },
      ],
      generatedAt: '2026-11-07T12:00:00.000Z',
      generatedBy: 'مدير النظام',
    };
  }

  it('validates a correct document successfully', async () => {
    const doc = makeValidDoc();
    const dto = plainToInstance(RenderReportExcelDto, doc);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects a document with title exceeding 200 characters', async () => {
    const doc = makeValidDoc();
    doc.title = 'A'.repeat(201);
    const dto = plainToInstance(RenderReportExcelDto, doc);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejects a document with more than 20 blocks', async () => {
    const doc = makeValidDoc();
    const block: ReportBlock = { type: 'note', tone: 'info', text: 'ملاحظة' };
    doc.blocks = Array.from({ length: 21 }, () => block);
    const dto = plainToInstance(RenderReportExcelDto, doc);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'blocks')).toBe(true);
  });

  it('rejects a document with table rows exceeding REPORT_ROW_LIMIT', async () => {
    const doc = makeValidDoc();
    const tableBlock = doc.blocks[0];
    if (tableBlock && tableBlock.type === 'table') {
      tableBlock.rows = Array.from({ length: REPORT_ROW_LIMIT + 1 }, () => ({
        name: 'طالب',
        phone: '0900000000',
      }));
    }
    const dto = plainToInstance(RenderReportExcelDto, doc);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'blocks')).toBe(true);
  });

  it('renders a valid document into an RTL Excel workbook buffer', async () => {
    const doc = makeValidDoc();
    const buffer = await excelService.toBuffer(doc, 'معهد الأوائل');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    // XLSX is a ZIP container: first bytes are 'PK\x03\x04' (0x50, 0x4b, 0x03, 0x04)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
