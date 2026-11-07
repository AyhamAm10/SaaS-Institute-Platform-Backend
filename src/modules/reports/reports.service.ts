import { Inject, Injectable } from '@nestjs/common';
import { AcademicYear } from '@prisma/client';
import { RequestContext } from '../../context/request-context';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { hasPermission } from '../../common/types/permissions';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { InstituteRepository } from '../institutes/institute.repository';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
import { TeacherScopeService } from '../sections/teacher-scope.service';
import { StaffActivityService } from '../staff/staff-activity.service';
import { PaymentsService } from '../fees/payments.service';
import { findReport, REPORT_CATALOG, ReportDefinition, ReportParamKind } from './report-catalog';
import { PARAM_FIELDS, ReportQueryDto } from './dto/report-query.dto';
import { ReportDocument } from './document/report-document';
import { isoDate, moneyText } from './document/report-format';
import { REPORT_ROW_LIMIT } from './reports.rules';
import { ReportVerificationService } from './report-verification.service';
import { ReportExcelService } from './report-excel.service';
import { ReportBuilder, ReportBuilderGroup, ReportContext } from './builders/report-context';
import { StudentReports } from './builders/student.reports';
import { FinanceReports } from './builders/finance.reports';
import { AttendanceReports } from './builders/attendance.reports';
import { AcademicReports } from './builders/academic.reports';
import { SheetReports } from './builders/sheets.reports';
import { AdminReports } from './builders/admin.reports';

/** Arabic name of each parameter (missing-parameter message). */
const PARAM_LABELS: Record<ReportParamKind, string> = {
  student: 'الطالب',
  section: 'الشعبة',
  exam: 'المذاكرة',
  teacher: 'المدرّس',
  date: 'التاريخ',
  from: 'بداية الفترة',
  to: 'نهاية الفترة',
  currency: 'العملة',
  paymentMethod: 'طريقة الدفع',
  minCount: 'الحد الأدنى',
  days: 'عدد الأيام',
};

/**
 * Reports (D3). Resolves a catalog entry, checks the caller's permission
 * and teacher scope, builds the document through the domain-composing
 * builders, then stamps time, author and (for verifiable documents) a
 * signed document number. Excel is written from the same document.
 */
@Injectable()
export class ReportsService {
  private readonly builders: Record<string, ReportBuilder>;

  constructor(
    @Inject(StudentReports) student: StudentReports,
    @Inject(FinanceReports) finance: FinanceReports,
    @Inject(AttendanceReports) attendance: AttendanceReports,
    @Inject(AcademicReports) academic: AcademicReports,
    @Inject(SheetReports) sheets: SheetReports,
    @Inject(AdminReports) admin: AdminReports,
    @Inject(InstituteClockService) private readonly clock: InstituteClockService,
    @Inject(AcademicYearRepository) private readonly yearRepository: AcademicYearRepository,
    @Inject(InstituteRepository) private readonly instituteRepository: InstituteRepository,
    @Inject(TeacherScopeService) private readonly scope: TeacherScopeService,
    @Inject(StaffActivityService) private readonly staff: StaffActivityService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(ReportVerificationService) private readonly verification: ReportVerificationService,
    @Inject(ReportExcelService) private readonly excelWriter: ReportExcelService,
  ) {
    const groups: ReportBuilderGroup[] = [student, finance, attendance, academic, sheets, admin];
    this.builders = Object.assign({}, ...groups.map((g) => g.builders));
  }

  /** Reports the caller may open. */
  catalog(): ReportDefinition[] {
    const role = RequestContext.getRole();
    return REPORT_CATALOG.filter((r) => hasPermission(role, r.permission));
  }

  /** Keys with a definition but no builder (must stay empty; checked by tests). */
  missingBuilders(): string[] {
    return REPORT_CATALOG.filter((r) => !this.builders[r.key]).map((r) => r.key);
  }

  async build(key: string, query: ReportQueryDto): Promise<ReportDocument> {
    const definition = this.resolve(key, query);
    if (query.sectionId) await this.scope.assertTeachesSection(query.sectionId);

    const [today, timeZone, year] = await Promise.all([
      this.clock.today(),
      this.clock.getTimezone(),
      this.resolveYear(),
    ]);
    const ctx: ReportContext = {
      query,
      today,
      timeZone,
      branchId: RequestContext.getBranchId() ?? undefined,
      year: year && {
        id: year.id,
        name: year.name,
        startDate: isoDate(year.startDate),
        endDate: isoDate(year.endDate),
      },
      take: REPORT_ROW_LIMIT,
    };
    const { verify, ...body } = await this.builders[key](ctx);
    const generatedAt = new Date();
    const userId = RequestContext.get()?.userId;
    const names = userId ? await this.staff.getUserNames([userId]) : new Map<number, string>();

    return {
      key,
      ...body,
      generatedAt: generatedAt.toISOString(),
      generatedBy: (userId && names.get(userId)) || null,
      ...(definition.verifiable &&
        verify && {
          verification: this.verification.issue({
            instituteId: RequestContext.getInstituteId(),
            kind: key,
            subject: verify.subject,
            lines: verify.lines,
            issuedAt: generatedAt,
          }),
        }),
    };
  }

  /** Same document as an .xlsx file. */
  async excel(key: string, query: ReportQueryDto): Promise<{ buffer: Buffer; filename: string }> {
    const doc = await this.build(key, query);
    const institute = await this.instituteRepository.findById(RequestContext.getInstituteId());
    return {
      buffer: await this.excelWriter.toBuffer(doc, institute?.name ?? ''),
      filename: `${key}-${doc.generatedAt.slice(0, 10)}.xlsx`,
    };
  }

  /** Document number + token printed on a payment receipt. */
  async receiptVerification(paymentId: number) {
    const payment = await this.payments.findDetails(paymentId);
    return this.verification.issue({
      instituteId: RequestContext.getInstituteId(),
      kind: 'receipt',
      subject: payment.subscription.student.fullName,
      lines: [
        `إيصال رقم ${payment.receiptNumber}`,
        moneyText(Number(payment.amount), payment.currency),
        payment.status === 'CANCELLED' ? 'إيصال ملغى' : `بتاريخ ${isoDate(payment.paidAt)}`,
      ],
      issuedAt: new Date(),
    });
  }

  /** Definition with permission and required parameters checked. */
  private resolve(key: string, query: ReportQueryDto): ReportDefinition {
    const definition = findReport(key);
    Ensure.custom(!definition || !this.builders[key], ErrorMessages.get('report_not_found'), 404);
    Ensure.forbidden(
      !hasPermission(RequestContext.getRole(), definition!.permission),
      ErrorMessages.get('permission_denied'),
    );
    for (const param of definition!.params) {
      Ensure.custom(
        param.required && query[PARAM_FIELDS[param.kind]] === undefined,
        ErrorMessages.get('report_param_required', { param: PARAM_LABELS[param.kind] }),
        400,
      );
    }
    return definition!;
  }

  /** Header year, else the current one (never created here). */
  private async resolveYear(): Promise<AcademicYear | null> {
    const headerYearId = RequestContext.getAcademicYearId();
    return headerYearId ? this.yearRepository.findById(headerYearId) : this.yearRepository.findCurrentYear();
  }
}
