import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportVerificationService } from './report-verification.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { RenderReportExcelDto } from './dto/render-report-excel.dto';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Permission } from '../../common/types/permissions';

/** Any dashboard reader; each report then checks its own permission. */
const ANY_VIEW: Permission[] = [
  'dashboard.view',
  'students.view',
  'attendance.view',
  'fees.view',
  'exams.view',
  'academic.view',
  'staff.view',
];

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Reports (phase 3 D3, role.md §10.7): catalog, documents (JSON for the
 * screen / print page), Excel files, and the public document verification.
 */
@Controller('reports')
@RequirePermission(...ANY_VIEW)
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(ReportVerificationService)
    private readonly verification: ReportVerificationService,
  ) {}

  @Get('catalog')
  catalog() {
    return this.reports.catalog();
  }

  /** Public: what the institute issued under this QR code. */
  @Public()
  @Get('verify/:token')
  verify(@Param('token') token: string) {
    return this.verification.verify(token);
  }

  @Get('receipts/:paymentId/verification')
  @RequirePermission('fees.view')
  receiptVerification(@Param('paymentId', ParseIntPipe) paymentId: number) {
    return this.reports.receiptVerification(paymentId);
  }

  @Get(':key/excel')
  async excel(@Param('key') key: string, @Query() query: ReportQueryDto) {
    const { buffer, filename } = await this.reports.excel(key, query);
    return new StreamableFile(buffer, {
      type: XLSX,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post('render/excel')
  @HttpCode(HttpStatus.OK)
  async renderExcel(@Body() dto: RenderReportExcelDto) {
    const { buffer, filename } = await this.reports.renderExcel(dto);
    return new StreamableFile(buffer, {
      type: XLSX,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':key')
  build(@Param('key') key: string, @Query() query: ReportQueryDto) {
    return this.reports.build(key, query);
  }
}
