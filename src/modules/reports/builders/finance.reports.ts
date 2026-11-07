import { Inject, Injectable } from '@nestjs/common';
import { Currency, PaymentStatus } from '@prisma/client';
import { getLocalParts, shiftLocalDate } from '../../../common/time/timezone';
import { FeesReportDataService } from '../../fees/fees-report-data.service';
import { SectionsService } from '../../sections/sections.service';
import { StaffActivityService } from '../../staff/staff-activity.service';
import { EnrollmentsService } from '../../enrollments/enrollments.service';
import { ReportPayment } from '../../fees/repositories/payment.repository';
import { badge, money, ReportBody, ReportColumn, ReportRow } from '../document/report-document';
import {
  CURRENCY_LABELS,
  dateText,
  isoDate,
  PAYMENT_METHOD_LABELS,
  periodText,
  timeText,
} from '../document/report-format';
import { AGING_BUCKETS, agingBucket, daysBetween, monthKeysBetween, percent, resolvePeriod } from '../reports.rules';
import { ReportBuilderGroup, ReportContext, requireYear } from './report-context';
import { CURRENCY_ORDER, currencyStats, currencyTotals, groupBy, num, openAmount } from './report-helpers';

const RECEIPT_COLUMNS: ReportColumn[] = [
  { key: 'receipt', title: 'الإيصال', kind: 'number', width: 0.7 },
  { key: 'time', title: 'الوقت', kind: 'text', width: 0.6 },
  { key: 'student', title: 'الطالب', kind: 'text', width: 1.6 },
  { key: 'section', title: 'الشعبة', kind: 'text' },
  { key: 'method', title: 'طريقة الدفع', kind: 'text', width: 0.8 },
  { key: 'staff', title: 'الموظف', kind: 'text' },
  { key: 'amount', title: 'المبلغ', kind: 'money' },
];

/** Finance reports (D3): composition of the fees data, one row per currency. */
@Injectable()
export class FinanceReports implements ReportBuilderGroup {
  constructor(
    @Inject(FeesReportDataService) private readonly fees: FeesReportDataService,
    @Inject(SectionsService) private readonly sections: SectionsService,
    @Inject(StaffActivityService) private readonly staff: StaffActivityService,
    @Inject(EnrollmentsService) private readonly enrollments: EnrollmentsService,
  ) {}

  readonly builders = {
    'daily-cashbox': (ctx: ReportContext) => this.dailyCashbox(ctx),
    'payments-register': (ctx: ReportContext) => this.paymentsRegister(ctx),
    'overdue-aging': (ctx: ReportContext) => this.overdueAging(ctx),
    'upcoming-dues': (ctx: ReportContext) => this.upcomingDues(ctx),
    'monthly-collection': (ctx: ReportContext) => this.monthlyCollection(ctx),
    'section-finance': (ctx: ReportContext) => this.sectionFinance(ctx),
    discounts: (ctx: ReportContext) => this.discounts(ctx),
    'cancelled-payments': (ctx: ReportContext) => this.cancelledPayments(ctx),
    'students-without-contract': (ctx: ReportContext) => this.withoutContract(ctx),
  };

  private async dailyCashbox(ctx: ReportContext): Promise<ReportBody> {
    const day = ctx.query.date ?? ctx.today;
    const period = { from: day, to: day };
    const [paid, cancelled] = await Promise.all([
      this.fees.getPayments(period, { by: 'paidAt', take: ctx.take }),
      this.fees.getPayments(period, { by: 'cancelledAt', status: PaymentStatus.CANCELLED, take: ctx.take }),
    ]);
    const active = paid.filter((p) => p.status === PaymentStatus.ACTIVE);
    const names = await this.staff.getUserNames(ids(paid.map((p) => p.createdById)));
    const amountOf = (p: ReportPayment) => ({ amount: num(p.amount), currency: p.currency });

    const byMethod = [...groupBy(active, (p) => `${p.paymentMethod}|${p.currency}`)].map(([key, list]) => {
      const [method, currency] = key.split('|') as [keyof typeof PAYMENT_METHOD_LABELS, Currency];
      return { method: PAYMENT_METHOD_LABELS[method], count: list.length, amount: sumMoney(list.map(amountOf), currency) };
    });
    const byStaff = [...groupBy(active, (p) => `${p.createdById ?? 0}|${p.currency}`)].map(([key, list]) => {
      const [id, currency] = key.split('|');
      return {
        staff: names.get(Number(id)) ?? '—',
        count: list.length,
        amount: sumMoney(list.map(amountOf), currency as Currency),
      };
    });

    return {
      title: 'الصندوق اليومي',
      subtitle: 'إغلاق صندوق اليوم: المحصّل حسب العملة وطريقة الدفع والموظف',
      orientation: 'portrait',
      meta: [{ label: 'اليوم', value: dateText(day) }],
      blocks: [
        {
          type: 'stats',
          items: [
            ...currencyStats('المحصّل', active.map(amountOf), 'success'),
            { label: 'عدد الإيصالات', value: active.length, tone: 'brand' },
            { label: 'إيصالات ملغاة اليوم', value: cancelled.length, tone: cancelled.length ? 'danger' : 'neutral' },
          ],
        },
        {
          type: 'table',
          title: 'حسب طريقة الدفع',
          columns: [
            { key: 'method', title: 'طريقة الدفع', kind: 'text' },
            { key: 'count', title: 'عدد الإيصالات', kind: 'number' },
            { key: 'amount', title: 'المبلغ', kind: 'money' },
          ],
          rows: byMethod,
          emptyText: 'لا توجد دفعات في هذا اليوم',
        },
        {
          type: 'table',
          title: 'حسب الموظف',
          columns: [
            { key: 'staff', title: 'الموظف', kind: 'text' },
            { key: 'count', title: 'عدد الإيصالات', kind: 'number' },
            { key: 'amount', title: 'المبلغ', kind: 'money' },
          ],
          rows: byStaff,
          emptyText: 'لا توجد دفعات في هذا اليوم',
        },
        {
          type: 'table',
          title: 'الإيصالات',
          columns: RECEIPT_COLUMNS,
          rows: active.map((p) => receiptRow(p, ctx.timeZone, names)),
          totals: currencyTotals(active.map((p) => ({ currency: p.currency, amounts: { amount: num(p.amount) } })), 'student', ['amount']),
          emptyText: 'لا توجد دفعات في هذا اليوم',
        },
        ...(cancelled.length
          ? [
              {
                type: 'table' as const,
                title: 'إيصالات أُلغيت اليوم',
                columns: [
                  { key: 'receipt', title: 'الإيصال', kind: 'number' as const },
                  { key: 'student', title: 'الطالب', kind: 'text' as const },
                  { key: 'reason', title: 'السبب', kind: 'text' as const, width: 2 },
                  { key: 'amount', title: 'المبلغ', kind: 'money' as const },
                ],
                rows: cancelled.map((p) => ({
                  receipt: p.receiptNumber,
                  student: p.subscription.student.fullName,
                  reason: p.cancelReason ?? '—',
                  amount: money(num(p.amount), p.currency),
                })),
              },
            ]
          : []),
        { type: 'signatures', items: ['أمين الصندوق', 'المحاسب', 'المدير'] },
      ],
    };
  }

  private async paymentsRegister(ctx: ReportContext): Promise<ReportBody> {
    const { from, to } = resolvePeriod(ctx.today, ctx.query.from, ctx.query.to);
    const payments = await this.fees.getPayments(
      { from, to },
      {
        by: 'paidAt',
        status: PaymentStatus.ACTIVE,
        currency: ctx.query.currency,
        paymentMethod: ctx.query.paymentMethod,
        take: ctx.take,
      },
    );
    const names = await this.staff.getUserNames(ids(payments.map((p) => p.createdById)));
    const meta = [{ label: 'الفترة', value: periodText(from, to) }];
    if (ctx.query.currency) meta.push({ label: 'العملة', value: CURRENCY_LABELS[ctx.query.currency] });
    if (ctx.query.paymentMethod) meta.push({ label: 'طريقة الدفع', value: PAYMENT_METHOD_LABELS[ctx.query.paymentMethod] });

    return {
      title: 'سجل الدفعات',
      subtitle: 'كل الإيصالات الفعالة خلال الفترة',
      orientation: 'landscape',
      meta,
      blocks: [
        {
          type: 'stats',
          items: [
            ...currencyStats('المجموع', payments.map((p) => ({ amount: num(p.amount), currency: p.currency })), 'success'),
            { label: 'عدد الإيصالات', value: payments.length },
            { label: 'عدد الطلاب', value: new Set(payments.map((p) => p.subscription.student.id)).size },
          ],
        },
        {
          type: 'table',
          columns: [{ key: 'date', title: 'التاريخ', kind: 'date', width: 0.8 }, ...RECEIPT_COLUMNS],
          rows: payments.map((p) => ({ date: isoDate(p.paidAt), ...receiptRow(p, ctx.timeZone, names) })),
          totals: currencyTotals(payments.map((p) => ({ currency: p.currency, amounts: { amount: num(p.amount) } })), 'student', ['amount']),
          emptyText: 'لا توجد دفعات في هذه الفترة',
        },
      ],
    };
  }

  private async overdueAging(ctx: ReportContext): Promise<ReportBody> {
    const sectionName = await this.sectionName(ctx);
    const rows = await this.fees.getOverdueInstallments({
      sectionId: ctx.query.sectionId,
      take: ctx.take,
    });
    const items = rows
      .map((inst) => {
        const currency = inst.subscription.currency;
        const due = isoDate(inst.dueDate);
        return {
          inst,
          currency,
          due,
          late: daysBetween(due, ctx.today),
          bucket: agingBucket(due, ctx.today),
          open: openAmount(inst.amount, inst.paidAmount, currency),
        };
      })
      .sort((a, b) => b.late - a.late);

    const bucketRows: ReportRow[] = AGING_BUCKETS.flatMap((bucket) =>
      CURRENCY_ORDER.flatMap((currency) => {
        const list = items.filter((i) => i.bucket === bucket && i.currency === currency);
        if (list.length === 0) return [];
        return [
          {
            bucket: badge(`${bucket} يوم`, BUCKET_TONES[bucket]),
            count: list.length,
            students: new Set(list.map((i) => i.inst.subscription.student.id)).size,
            amount: sumMoney(list.map((i) => ({ amount: i.open, currency })), currency),
          },
        ];
      }),
    );

    return {
      title: 'الأقساط المتأخرة حسب المدة',
      subtitle: 'المبالغ المستحقة غير المدفوعة حتى اليوم، مرتّبة من الأقدم',
      orientation: 'landscape',
      meta: [
        { label: 'حتى تاريخ', value: dateText(ctx.today) },
        ...(sectionName ? [{ label: 'الشعبة', value: sectionName }] : []),
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            ...currencyStats('إجمالي المتأخر', items.map((i) => ({ amount: i.open, currency: i.currency })), 'danger'),
            { label: 'أقساط متأخرة', value: items.length, tone: 'warning' },
            { label: 'طلاب متأخرون', value: new Set(items.map((i) => i.inst.subscription.student.id)).size, tone: 'warning' },
          ],
        },
        {
          type: 'table',
          title: 'حسب مدة التأخير',
          columns: [
            { key: 'bucket', title: 'المدة', kind: 'badge' },
            { key: 'count', title: 'الأقساط', kind: 'number' },
            { key: 'students', title: 'الطلاب', kind: 'number' },
            { key: 'amount', title: 'المبلغ', kind: 'money' },
          ],
          rows: bucketRows,
          emptyText: 'لا توجد أقساط متأخرة',
        },
        {
          type: 'table',
          title: 'التفاصيل',
          columns: [
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.5 },
            { key: 'family', title: 'ولي الأمر', kind: 'text' },
            { key: 'phone', title: 'الهاتف', kind: 'phone' },
            { key: 'section', title: 'الشعبة', kind: 'text' },
            { key: 'number', title: 'القسط', kind: 'number', width: 0.5 },
            { key: 'due', title: 'الاستحقاق', kind: 'date' },
            { key: 'late', title: 'أيام التأخير', kind: 'number', width: 0.7 },
            { key: 'amount', title: 'المتبقي', kind: 'money' },
          ],
          rows: items.map((i) => ({
            student: i.inst.subscription.student.fullName,
            family: i.inst.subscription.student.family?.familyName ?? '—',
            phone: i.inst.subscription.student.family?.phone ?? null,
            section: i.inst.subscription.section.name,
            number: i.inst.installmentNumber,
            due: i.due,
            late: i.late,
            amount: money(i.open, i.currency),
          })),
          totals: currencyTotals(items.map((i) => ({ currency: i.currency, amounts: { amount: i.open } })), 'student', ['amount']),
          emptyText: 'لا توجد أقساط متأخرة',
        },
      ],
    };
  }

  private async upcomingDues(ctx: ReportContext): Promise<ReportBody> {
    const { from, to } = resolvePeriod(ctx.today, ctx.query.from ?? ctx.today, ctx.query.to);
    const rows = await this.fees.getUpcomingInstallments({ from, to }, { take: ctx.take });
    const items = rows.map((inst) => ({
      inst,
      currency: inst.subscription.currency,
      open: openAmount(inst.amount, inst.paidAmount, inst.subscription.currency),
    }));
    const byWeek = [...groupBy(items, (i) => weekStart(isoDate(i.inst.dueDate), from))];

    return {
      title: 'المستحقات القادمة',
      subtitle: 'الأقساط غير المدفوعة المستحقة خلال الفترة: ما يُتوقع تحصيله',
      orientation: 'landscape',
      meta: [{ label: 'الفترة', value: periodText(from, to) }],
      blocks: [
        {
          type: 'stats',
          items: [
            ...currencyStats('المتوقع تحصيله', items.map((i) => ({ amount: i.open, currency: i.currency })), 'info'),
            { label: 'عدد الأقساط', value: items.length },
          ],
        },
        {
          type: 'table',
          title: 'حسب الأسبوع',
          columns: [
            { key: 'week', title: 'الأسبوع يبدأ', kind: 'date' },
            { key: 'count', title: 'الأقساط', kind: 'number' },
            ...CURRENCY_ORDER.map((c) => ({ key: c, title: `المبلغ (${CURRENCY_LABELS[c]})`, kind: 'money' as const })),
          ],
          rows: byWeek.map(([week, list]) => ({
            week,
            count: list.length,
            ...Object.fromEntries(
              CURRENCY_ORDER.map((c) => {
                const of = list.filter((i) => i.currency === c);
                return [c, of.length ? sumMoney(of.map((i) => ({ amount: i.open, currency: c })), c) : null];
              }),
            ),
          })),
          emptyText: 'لا توجد أقساط مستحقة في هذه الفترة',
        },
        {
          type: 'table',
          title: 'التفاصيل',
          columns: [
            { key: 'due', title: 'الاستحقاق', kind: 'date' },
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.5 },
            { key: 'phone', title: 'هاتف ولي الأمر', kind: 'phone' },
            { key: 'section', title: 'الشعبة', kind: 'text' },
            { key: 'number', title: 'القسط', kind: 'number', width: 0.5 },
            { key: 'amount', title: 'المتبقي', kind: 'money' },
          ],
          rows: items.map((i) => ({
            due: isoDate(i.inst.dueDate),
            student: i.inst.subscription.student.fullName,
            phone: i.inst.subscription.student.family?.phone ?? null,
            section: i.inst.subscription.section.name,
            number: i.inst.installmentNumber,
            amount: money(i.open, i.currency),
          })),
          totals: currencyTotals(items.map((i) => ({ currency: i.currency, amounts: { amount: i.open } })), 'student', ['amount']),
          emptyText: 'لا توجد أقساط مستحقة في هذه الفترة',
        },
      ],
    };
  }

  private async monthlyCollection(ctx: ReportContext): Promise<ReportBody> {
    const year = requireYear(ctx);
    const last = year.endDate < ctx.today ? year.endDate : ctx.today;
    const [contracts, payments] = await Promise.all([
      this.fees.getYearContracts({ academicYearId: year.id, take: ctx.take }),
      this.fees.getPayments(
        { from: year.startDate, to: last < year.startDate ? year.startDate : last },
        { by: 'paidAt', status: PaymentStatus.ACTIVE, take: ctx.take },
      ),
    ]);
    const months = monthKeysBetween(year.startDate, year.endDate);
    const rows: ReportRow[] = [];
    const bars: { label: string; value: number; caption: string; tone: 'success' | 'warning' | 'danger' }[] = [];

    for (const month of months) {
      for (const currency of CURRENCY_ORDER) {
        const due = contracts
          .filter((c) => c.currency === currency)
          .flatMap((c) => c.installments)
          .filter((i) => isoDate(i.dueDate).startsWith(month))
          .reduce((acc, i) => acc + num(i.amount), 0);
        const collected = payments
          .filter((p) => p.currency === currency && monthOf(p.paidAt, ctx.timeZone) === month)
          .reduce((acc, p) => acc + num(p.amount), 0);
        if (due === 0 && collected === 0) continue;
        const rate = percent(collected, due);
        rows.push({
          month,
          currency: CURRENCY_LABELS[currency],
          due: money(round(due, currency), currency),
          collected: money(round(collected, currency), currency),
          rate,
        });
        if (rate !== null) {
          bars.push({
            label: `${month} (${CURRENCY_LABELS[currency]})`,
            value: Math.min(100, rate),
            caption: `${rate}%`,
            tone: rate >= 90 ? 'success' : rate >= 60 ? 'warning' : 'danger',
          });
        }
      }
    }

    return {
      title: 'التحصيل الشهري',
      subtitle: 'الأقساط المستحقة في كل شهر مقابل ما حُصّل فعلاً (كل عملة على حدة)',
      orientation: 'portrait',
      meta: [{ label: 'السنة الدراسية', value: year.name }],
      blocks: [
        {
          type: 'stats',
          items: [
            ...currencyStats('المحصّل خلال السنة', payments.map((p) => ({ amount: num(p.amount), currency: p.currency })), 'success'),
            { label: 'العقود', value: contracts.length },
          ],
        },
        { type: 'bars', title: 'نسبة التحصيل الشهرية', items: bars },
        {
          type: 'table',
          columns: [
            { key: 'month', title: 'الشهر', kind: 'text' },
            { key: 'currency', title: 'العملة', kind: 'text', width: 0.6 },
            { key: 'due', title: 'المستحق', kind: 'money' },
            { key: 'collected', title: 'المحصّل', kind: 'money' },
            { key: 'rate', title: 'النسبة', kind: 'percent', width: 0.7 },
          ],
          rows,
          emptyText: 'لا توجد عقود أو دفعات في هذه السنة',
        },
        {
          type: 'note',
          tone: 'info',
          text: 'المحصّل يُحسب بعملة الدفعة والمستحق بعملة العقد؛ الدفعة بعملة مختلفة عن عقدها تظهر في عملتها.',
        },
      ],
    };
  }

  private async sectionFinance(ctx: ReportContext): Promise<ReportBody> {
    const year = requireYear(ctx);
    const sectionName = await this.sectionName(ctx);
    const contracts = await this.fees.getYearContracts({
      academicYearId: year.id,
      sectionId: ctx.query.sectionId,
      take: ctx.take,
    });
    const items = contracts.map((c) => {
      const total = num(c.totalAmount);
      const paid = c.installments.reduce((acc, i) => acc + num(i.paidAmount), 0);
      const overdue = c.installments
        .filter((i) => isoDate(i.dueDate) < ctx.today)
        .reduce((acc, i) => acc + openAmount(i.amount, i.paidAmount, c.currency), 0);
      return { c, total, paid: round(paid, c.currency), remaining: round(total - paid, c.currency), overdue: round(overdue, c.currency) };
    });

    return {
      title: 'الوضع المالي للشعبة',
      subtitle: 'رصيد كل طالب: الإجمالي بعد الحسم، المدفوع، المتبقي والمتأخر منه',
      orientation: 'landscape',
      meta: [
        { label: 'الشعبة', value: sectionName ?? '—' },
        { label: 'السنة الدراسية', value: year.name },
        { label: 'حتى تاريخ', value: dateText(ctx.today) },
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            ...currencyStats('المدفوع', items.map((i) => ({ amount: i.paid, currency: i.c.currency })), 'success'),
            ...currencyStats('المتبقي', items.map((i) => ({ amount: i.remaining, currency: i.c.currency })), 'brand'),
            ...currencyStats('المتأخر', items.map((i) => ({ amount: i.overdue, currency: i.c.currency })), 'danger'),
          ],
        },
        {
          type: 'table',
          columns: [
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.5 },
            { key: 'phone', title: 'هاتف ولي الأمر', kind: 'phone' },
            { key: 'total', title: 'الإجمالي', kind: 'money' },
            { key: 'paid', title: 'المدفوع', kind: 'money' },
            { key: 'remaining', title: 'المتبقي', kind: 'money' },
            { key: 'overdue', title: 'المتأخر', kind: 'money' },
            { key: 'state', title: 'الحالة', kind: 'badge', width: 0.8 },
          ],
          rows: items.map((i) => ({
            student: i.c.student.fullName,
            phone: i.c.student.family?.phone ?? null,
            total: money(i.total, i.c.currency),
            paid: money(i.paid, i.c.currency),
            remaining: money(i.remaining, i.c.currency),
            overdue: money(i.overdue, i.c.currency),
            state:
              i.remaining <= 0 ? badge('مسدّد', 'success') : i.overdue > 0 ? badge('متأخر', 'danger') : badge('منتظم', 'info'),
          })),
          totals: currencyTotals(
            items.map((i) => ({
              currency: i.c.currency,
              amounts: { total: i.total, paid: i.paid, remaining: i.remaining, overdue: i.overdue },
            })),
            'student',
            ['total', 'paid', 'remaining', 'overdue'],
          ),
          emptyText: 'لا توجد عقود في هذه الشعبة',
        },
      ],
    };
  }

  private async discounts(ctx: ReportContext): Promise<ReportBody> {
    const year = requireYear(ctx);
    const sectionName = await this.sectionName(ctx);
    const contracts = await this.fees.getYearContracts({
      academicYearId: year.id,
      sectionId: ctx.query.sectionId,
      withDiscount: true,
      take: ctx.take,
    });

    return {
      title: 'الحسومات',
      subtitle: 'العقود التي مُنح عليها حسم، مع السبب والنسبة (تقرير رقابي)',
      orientation: 'landscape',
      meta: [
        { label: 'السنة الدراسية', value: year.name },
        ...(sectionName ? [{ label: 'الشعبة', value: sectionName }] : []),
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            ...currencyStats('مجموع الحسومات', contracts.map((c) => ({ amount: num(c.discountAmount), currency: c.currency })), 'warning'),
            { label: 'عقود عليها حسم', value: contracts.length },
          ],
        },
        {
          type: 'table',
          columns: [
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.5 },
            { key: 'section', title: 'الشعبة', kind: 'text' },
            { key: 'gross', title: 'القيمة قبل الحسم', kind: 'money' },
            { key: 'discount', title: 'الحسم', kind: 'money' },
            { key: 'rate', title: 'النسبة', kind: 'percent', width: 0.6 },
            { key: 'total', title: 'الصافي', kind: 'money' },
            { key: 'reason', title: 'السبب', kind: 'text', width: 1.6 },
          ],
          rows: contracts.map((c) => ({
            student: c.student.fullName,
            section: c.section.name,
            gross: money(num(c.grossAmount), c.currency),
            discount: money(num(c.discountAmount), c.currency),
            rate: percent(num(c.discountAmount), num(c.grossAmount)),
            total: money(num(c.totalAmount), c.currency),
            reason: c.discountReason ?? '—',
          })),
          totals: currencyTotals(
            contracts.map((c) => ({
              currency: c.currency,
              amounts: { gross: num(c.grossAmount), discount: num(c.discountAmount), total: num(c.totalAmount) },
            })),
            'student',
            ['gross', 'discount', 'total'],
          ),
          emptyText: 'لا توجد حسومات',
        },
      ],
    };
  }

  private async cancelledPayments(ctx: ReportContext): Promise<ReportBody> {
    const { from, to } = resolvePeriod(ctx.today, ctx.query.from, ctx.query.to);
    const payments = await this.fees.getPayments(
      { from, to },
      { by: 'cancelledAt', status: PaymentStatus.CANCELLED, take: ctx.take },
    );
    const names = await this.staff.getUserNames(ids(payments.flatMap((p) => [p.createdById, p.updatedById])));

    return {
      title: 'الدفعات الملغاة',
      subtitle: 'إيصالات أُلغيت خلال الفترة مع السبب ومن ألغاها (تقرير رقابي)',
      orientation: 'landscape',
      meta: [{ label: 'فترة الإلغاء', value: periodText(from, to) }],
      blocks: [
        {
          type: 'stats',
          items: [
            ...currencyStats('قيمة الملغى', payments.map((p) => ({ amount: num(p.amount), currency: p.currency })), 'danger'),
            { label: 'عدد الإيصالات الملغاة', value: payments.length, tone: 'danger' },
          ],
        },
        {
          type: 'table',
          columns: [
            { key: 'receipt', title: 'الإيصال', kind: 'number', width: 0.6 },
            { key: 'paidAt', title: 'تاريخ الدفع', kind: 'date' },
            { key: 'cancelledAt', title: 'تاريخ الإلغاء', kind: 'date' },
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.4 },
            { key: 'amount', title: 'المبلغ', kind: 'money' },
            { key: 'reason', title: 'السبب', kind: 'text', width: 1.6 },
            { key: 'receivedBy', title: 'استلمها', kind: 'text' },
            { key: 'cancelledBy', title: 'ألغاها', kind: 'text' },
          ],
          rows: payments.map((p) => ({
            receipt: p.receiptNumber,
            paidAt: isoDate(p.paidAt),
            cancelledAt: p.cancelledAt ? isoDate(p.cancelledAt) : null,
            student: p.subscription.student.fullName,
            amount: money(num(p.amount), p.currency),
            reason: p.cancelReason ?? '—',
            receivedBy: names.get(p.createdById ?? 0) ?? '—',
            cancelledBy: names.get(p.updatedById ?? 0) ?? '—',
          })),
          totals: currencyTotals(payments.map((p) => ({ currency: p.currency, amounts: { amount: num(p.amount) } })), 'student', ['amount']),
          emptyText: 'لا توجد دفعات ملغاة في هذه الفترة',
        },
      ],
    };
  }

  private async withoutContract(ctx: ReportContext): Promise<ReportBody> {
    const year = requireYear(ctx);
    const sectionName = await this.sectionName(ctx);
    const rows = await this.enrollments.getYearEnrollments({
      academicYearId: year.id,
      sectionId: ctx.query.sectionId,
      branchId: ctx.branchId,
      activeOnly: true,
      withoutContract: true,
      take: ctx.take,
    });

    return {
      title: 'طلاب بدون عقد مالي',
      subtitle: 'تسجيلات فعالة لم يُنشأ لها عقد بعد: لا أقساط ولا متابعة دفع',
      orientation: 'portrait',
      meta: [
        { label: 'السنة الدراسية', value: year.name },
        ...(sectionName ? [{ label: 'الشعبة', value: sectionName }] : []),
      ],
      blocks: [
        { type: 'stats', items: [{ label: 'طلاب بدون عقد', value: rows.length, tone: rows.length ? 'warning' : 'success' }] },
        {
          type: 'table',
          columns: [
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.5 },
            { key: 'family', title: 'العائلة', kind: 'text' },
            { key: 'phone', title: 'الهاتف', kind: 'phone' },
            { key: 'section', title: 'الشعبة', kind: 'text' },
            { key: 'enrolledAt', title: 'تاريخ التسجيل', kind: 'date' },
          ],
          rows: rows.map((e) => ({
            student: e.student.fullName,
            family: e.student.family?.familyName ?? '—',
            phone: e.student.family?.phone ?? null,
            section: e.section.name,
            enrolledAt: isoDate(e.enrolledAt),
          })),
          emptyText: 'كل الطلاب المسجّلين لديهم عقود',
        },
      ],
    };
  }

  private async sectionName(ctx: ReportContext): Promise<string | null> {
    if (!ctx.query.sectionId) return null;
    return (await this.sections.findById(ctx.query.sectionId)).name;
  }
}

const BUCKET_TONES = { '1-30': 'warning', '31-60': 'warning', '61-90': 'danger', '90+': 'danger' } as const;

function ids(values: (number | null)[]): number[] {
  return [...new Set(values.filter((v): v is number => v !== null))];
}

function sumMoney(items: { amount: number; currency: Currency }[], currency: Currency) {
  return money(round(items.filter((i) => i.currency === currency).reduce((acc, i) => acc + i.amount, 0), currency), currency);
}

function round(value: number, currency: Currency): number {
  const factor = currency === 'USD' ? 100 : 1;
  return Math.round(value * factor) / factor;
}

function receiptRow(p: ReportPayment, timeZone: string, names: Map<number, string>): ReportRow {
  return {
    receipt: p.receiptNumber,
    time: timeText(p.paidAt, timeZone),
    student: p.subscription.student.fullName,
    section: p.subscription.section.name,
    method: PAYMENT_METHOD_LABELS[p.paymentMethod],
    staff: names.get(p.createdById ?? 0) ?? '—',
    amount: money(num(p.amount), p.currency),
  };
}

/** Local month (YYYY-MM) of an instant. */
function monthOf(at: Date, timeZone: string): string {
  return getLocalParts(at, timeZone).date.slice(0, 7);
}

/** Start of the 7-day window (counted from `from`) that holds `date`. */
function weekStart(date: string, from: string): string {
  return shiftLocalDate(from, Math.floor(daysBetween(from, date) / 7) * 7);
}
