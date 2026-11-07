import { Inject, Injectable } from '@nestjs/common';
import { EnrollmentsService } from '../../enrollments/enrollments.service';
import { StaffActivityService } from '../../staff/staff-activity.service';
import { badge, ReportBody } from '../document/report-document';
import { ENROLLMENT_STATUS_LABELS, isoDate, periodText, timeText } from '../document/report-format';
import { percent, resolvePeriod } from '../reports.rules';
import { ReportBuilderGroup, ReportContext, requireYear } from './report-context';
import { groupBy } from './report-helpers';

/** Arabic names of audited records. */
const ENTITY_LABELS: Record<string, string> = {
  student: 'طالب',
  family: 'عائلة',
  user: 'حساب',
  teacher: 'مدرّس',
  section: 'شعبة',
  subject: 'مادة',
  room: 'قاعة',
  studentEnrollment: 'تسجيل',
  studentSubscription: 'عقد مالي',
  installment: 'قسط',
  payment: 'دفعة',
  exam: 'مذاكرة',
  examResult: 'علامة',
  dailyAttendance: 'حضور',
};

const ACTION_BADGES = {
  UPDATE: badge('تعديل', 'info'),
  DELETE: badge('حذف', 'danger'),
  CREATE: badge('إنشاء', 'success'),
} as const;

/** Entries listed in the detail table of the activity report. */
const ACTIVITY_DETAIL_ROWS = 500;

/** Administration reports (D3). */
@Injectable()
export class AdminReports implements ReportBuilderGroup {
  constructor(
    @Inject(EnrollmentsService) private readonly enrollments: EnrollmentsService,
    @Inject(StaffActivityService) private readonly activity: StaffActivityService,
  ) {}

  readonly builders = {
    'enrollment-stats': (ctx: ReportContext) => this.enrollmentStats(ctx),
    'staff-activity': (ctx: ReportContext) => this.staffActivity(ctx),
  };

  private async enrollmentStats(ctx: ReportContext): Promise<ReportBody> {
    const year = requireYear(ctx);
    const rows = await this.enrollments.getYearEnrollments({ academicYearId: year.id, branchId: ctx.branchId, take: ctx.take });
    const active = rows.filter((r) => r.status === 'ACTIVE');
    const males = active.filter((r) => r.student.gender === 'MALE').length;
    const bySection = [...groupBy(rows, (r) => r.section.name)].map(([section, list]) => {
      const act = list.filter((r) => r.status === 'ACTIVE');
      return {
        section,
        active: act.length,
        male: act.filter((r) => r.student.gender === 'MALE').length,
        female: act.filter((r) => r.student.gender === 'FEMALE').length,
        withdrawn: list.filter((r) => r.status === 'WITHDRAWN').length,
        transferred: list.filter((r) => r.status === 'TRANSFERRED').length,
      };
    });
    const maxActive = Math.max(1, ...bySection.map((s) => s.active));
    const byMonth = [...groupBy(rows, (r) => isoDate(r.enrolledAt).slice(0, 7))].sort(([a], [b]) => a.localeCompare(b));
    const byStatus = [...groupBy(active, (r) => r.student.status?.name ?? 'بدون حالة')];

    return {
      title: 'إحصائيات الطلاب',
      subtitle: 'توزيع الطلاب حسب الشعبة والجنس والحالة، والتسجيل الشهري',
      orientation: 'portrait',
      meta: [{ label: 'السنة الدراسية', value: year.name }],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'الطلاب الفعالون', value: active.length, tone: 'brand' },
            { label: 'ذكور', value: males, tone: 'info' },
            { label: 'إناث', value: active.length - males, tone: 'info' },
            { label: 'منسحبون', value: rows.filter((r) => r.status === 'WITHDRAWN').length, tone: 'danger' },
            { label: 'بدون عقد مالي', value: active.filter((r) => !r.subscription).length, tone: 'warning' },
          ],
        },
        {
          type: 'bars',
          title: 'الطلاب في كل شعبة',
          items: bySection.map((s) => ({ label: s.section, value: (s.active / maxActive) * 100, caption: `${s.active} طالب`, tone: 'brand' as const })),
        },
        {
          type: 'table',
          title: 'حسب الشعبة',
          columns: [
            { key: 'section', title: 'الشعبة', kind: 'text', width: 1.4 },
            { key: 'active', title: 'فعال', kind: 'number' },
            { key: 'male', title: 'ذكور', kind: 'number' },
            { key: 'female', title: 'إناث', kind: 'number' },
            { key: 'withdrawn', title: 'منسحب', kind: 'number' },
            { key: 'transferred', title: 'منقول', kind: 'number' },
          ],
          rows: bySection,
          totals: [
            {
              section: 'المجموع',
              active: active.length,
              male: males,
              female: active.length - males,
              withdrawn: bySection.reduce((a, s) => a + s.withdrawn, 0),
              transferred: bySection.reduce((a, s) => a + s.transferred, 0),
            },
          ],
          emptyText: 'لا توجد تسجيلات في هذه السنة',
        },
        {
          type: 'table',
          title: 'التسجيل الشهري',
          columns: [
            { key: 'month', title: 'الشهر', kind: 'text' },
            { key: 'count', title: 'تسجيلات جديدة', kind: 'number' },
          ],
          rows: byMonth.map(([month, list]) => ({ month, count: list.length })),
          emptyText: 'لا توجد تسجيلات',
        },
        {
          type: 'table',
          title: 'حسب حالة الطالب',
          columns: [
            { key: 'status', title: 'الحالة', kind: 'text' },
            { key: 'count', title: 'الطلاب', kind: 'number' },
            { key: 'share', title: 'النسبة', kind: 'percent' },
          ],
          rows: byStatus.map(([status, list]) => ({ status, count: list.length, share: percent(list.length, active.length) })),
          emptyText: 'لا يوجد طلاب فعالون',
        },
        {
          type: 'note',
          tone: 'info',
          text: `حالات التسجيل: ${Object.values(ENROLLMENT_STATUS_LABELS).join('، ')}.`,
        },
      ],
    };
  }

  private async staffActivity(ctx: ReportContext): Promise<ReportBody> {
    const { from, to } = resolvePeriod(ctx.today, ctx.query.from, ctx.query.to);
    const entries = await this.activity.getActivity(from, to, ctx.take);
    const names = await this.activity.getUserNames([...new Set(entries.flatMap((e) => (e.userId ? [e.userId] : [])))]);
    const nameOf = (id: number | null) => (id ? (names.get(id) ?? `#${id}`) : 'النظام');
    const byPerson = [...groupBy(entries, (e) => e.userId)].map(([id, list]) => ({
      person: nameOf(id),
      updates: list.filter((e) => e.action === 'UPDATE').length,
      deletes: list.filter((e) => e.action === 'DELETE').length,
      total: list.length,
    }));
    const byEntity = [...groupBy(entries, (e) => e.entity)].map(([entity, list]) => ({
      entity: ENTITY_LABELS[entity] ?? entity,
      updates: list.filter((e) => e.action === 'UPDATE').length,
      deletes: list.filter((e) => e.action === 'DELETE').length,
    }));

    return {
      title: 'نشاط الموظفين',
      subtitle: 'التعديلات والحذف على السجلات حسب الموظف ونوع السجل',
      orientation: 'portrait',
      meta: [{ label: 'الفترة', value: periodText(from, to) }],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'العمليات', value: entries.length, tone: 'brand' },
            { label: 'تعديل', value: entries.filter((e) => e.action === 'UPDATE').length, tone: 'info' },
            { label: 'حذف', value: entries.filter((e) => e.action === 'DELETE').length, tone: 'danger' },
            { label: 'الموظفون', value: byPerson.length },
          ],
        },
        {
          type: 'table',
          title: 'حسب الموظف',
          columns: [
            { key: 'person', title: 'الموظف', kind: 'text', width: 1.4 },
            { key: 'updates', title: 'تعديل', kind: 'number' },
            { key: 'deletes', title: 'حذف', kind: 'number' },
            { key: 'total', title: 'المجموع', kind: 'number' },
          ],
          rows: byPerson.sort((a, b) => b.total - a.total),
          emptyText: 'لا يوجد نشاط في هذه الفترة',
        },
        {
          type: 'table',
          title: 'حسب نوع السجل',
          columns: [
            { key: 'entity', title: 'السجل', kind: 'text' },
            { key: 'updates', title: 'تعديل', kind: 'number' },
            { key: 'deletes', title: 'حذف', kind: 'number' },
          ],
          rows: byEntity,
          emptyText: 'لا يوجد نشاط في هذه الفترة',
        },
        {
          type: 'table',
          title: `آخر العمليات${entries.length > ACTIVITY_DETAIL_ROWS ? ` (أحدث ${ACTIVITY_DETAIL_ROWS})` : ''}`,
          columns: [
            { key: 'date', title: 'التاريخ', kind: 'date' },
            { key: 'time', title: 'الوقت', kind: 'text', width: 0.6 },
            { key: 'person', title: 'الموظف', kind: 'text' },
            { key: 'action', title: 'العملية', kind: 'badge', width: 0.7 },
            { key: 'entity', title: 'السجل', kind: 'text' },
            { key: 'entityId', title: 'الرقم', kind: 'number', width: 0.6 },
          ],
          rows: entries.slice(0, ACTIVITY_DETAIL_ROWS).map((e) => ({
            date: isoDate(e.createdAt),
            time: timeText(e.createdAt, ctx.timeZone),
            person: nameOf(e.userId),
            action: ACTION_BADGES[e.action] ?? badge(e.action, 'neutral'),
            entity: ENTITY_LABELS[e.entity] ?? e.entity,
            entityId: e.entityId,
          })),
          emptyText: 'لا يوجد نشاط في هذه الفترة',
        },
      ],
    };
  }
}
