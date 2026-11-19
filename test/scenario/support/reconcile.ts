import type { InstituteFixture } from './builders';
import type { Api } from './client';

/**
 * The monthly reconciliation of the full-year scenarios (plan 11): the same number,
 * read from every place that shows it, must be equal; and the database must stay sound.
 * Returns the list of mismatches (empty = reconciled), so a failure lists them all.
 */
export interface ReconcileInput {
  inst: InstituteFixture;
  /** Local date of the check (the clock is already set to it). */
  today: string;
  /** First day of the academic year (transcript period). */
  yearStart: string;
  /** Students to check, each with the app login of his family (null: no family login). */
  students: { id: number; family: Api | null }[];
  /** Sections whose finance report must match the students' summaries. */
  sections: number[];
  /**
   * With several academic years: the year (name) the header-scoped places show. Section finance and
   * the dashboard are per year, while the student summary covers every year (old debt never disappears).
   */
  yearName?: string;
  /** Skip the per-student report comparisons (scale scenarios check a sample only). */
  sampleEvery?: number;
}

type Money = { total: number; paid: number; remaining: number; overdue: number };
type Doc = { blocks: { type: string; title?: string; items?: { label: string; value: unknown }[]; rows?: Record<string, unknown>[] }[] };

const n = (v: unknown) => Number(v ?? 0);
const isMoney = (v: unknown): v is { amount: number; currency: string } => !!v && typeof v === 'object' && 'amount' in (v as object);

function statementMoney(doc: Doc): Record<string, Money> {
  const out: Record<string, Money> = {};
  let current: Money | null = null;
  for (const b of doc.blocks) {
    if (b.type !== 'stats') continue;
    for (const i of b.items ?? []) {
      if (!isMoney(i.value)) continue;
      if (i.label.startsWith('الإجمالي')) current = out[i.value.currency] = { total: i.value.amount, paid: 0, remaining: 0, overdue: 0 };
      else if (current && i.label === 'المدفوع') current.paid = i.value.amount;
      else if (current && i.label === 'المتبقي') current.remaining = i.value.amount;
      else if (current && i.label === 'المتأخر') current.overdue = i.value.amount;
    }
  }
  return out;
}

const statOf = (doc: Doc, label: string) => doc.blocks.filter((b) => b.type === 'stats').flatMap((b) => b.items ?? []).find((i) => i.label === label)?.value;

function rowsToMoney(rows: { currency: string; total: unknown; paid: unknown; remaining: unknown; overdue: unknown }[]): Record<string, Money> {
  return Object.fromEntries(
    rows.filter((r) => n(r.total) !== 0 || n(r.paid) !== 0).map((r) => [r.currency, { total: n(r.total), paid: n(r.paid), remaining: n(r.remaining), overdue: n(r.overdue) }]),
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function reconcile(input: ReconcileInput): Promise<string[]> {
  const { inst, today } = input;
  const admin = inst.admin;
  const issues: string[] = [];
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const q = (p: Record<string, string | number>) => new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)])).toString();
  const report = (key: string, p: Record<string, string | number>): Promise<Doc> => admin.get(`/reports/${key}?${q(p)}`);

  // ── 1. money, per student, from every place ───────────────────────────────
  const perStudent: Record<number, Record<string, Money>> = {};
  /** The same, for the header year only (= perStudent when a single year is involved). */
  const perStudentYear: Record<number, Record<string, Money>> = {};
  for (const [i, { id, family }] of input.students.entries()) {
    const summaryBody = await admin.get(`/students/${id}/financial-summary`);
    const summary = rowsToMoney(Array.isArray(summaryBody) ? summaryBody : summaryBody.currencies ?? summaryBody.totals ?? []);
    perStudent[id] = summary;
    perStudentYear[id] = summary;
    if (input.yearName && family) {
      const app = await family.get(`/mobile/students/${id}/finance`);
      const year: Record<string, Money> = {};
      for (const c of app.contracts as { yearName: string; currency: string; total: number; paid: number; remaining: number; installments: { remaining: number; status: string }[] }[]) {
        if (c.yearName !== input.yearName) continue;
        const m = (year[c.currency] ??= { total: 0, paid: 0, remaining: 0, overdue: 0 });
        m.total += n(c.total);
        m.paid += n(c.paid);
        m.remaining += n(c.remaining);
        m.overdue += c.installments.filter((i) => i.status === 'OVERDUE').reduce((sum, i) => sum + n(i.remaining), 0);
      }
      perStudentYear[id] = year;
    }
    if (input.sampleEvery && i % input.sampleEvery !== 0) continue;
    if (family) {
      const mobile = rowsToMoney((await family.get(`/mobile/students/${id}/finance`)).totals);
      if (!same(mobile, summary)) issues.push(`money ${id}: app ${JSON.stringify(mobile)} != summary ${JSON.stringify(summary)}`);
    }
    if (Object.keys(summary).length > 0) {
      const statement = statementMoney(await report('student-statement', { studentId: id }));
      if (!same(statement, summary)) issues.push(`money ${id}: statement ${JSON.stringify(statement)} != summary ${JSON.stringify(summary)}`);
    }
  }
  // section-finance rows = the students' summaries
  for (const sectionId of input.sections) {
    const doc = await report('section-finance', { sectionId });
    const table = doc.blocks.find((b) => b.type === 'table');
    for (const row of table?.rows ?? []) {
      const name = String(row.student);
      const total = row.total as { amount: number; currency: string };
      const student = await inst.s.prisma.student.findFirst({ where: { instituteId: inst.id, fullName: name } });
      const mine = student && perStudentYear[student.id]?.[total.currency];
      if (!mine) continue;
      const got = { total: total.amount, paid: n((row.paid as { amount: number }).amount), remaining: n((row.remaining as { amount: number }).amount), overdue: n((row.overdue as { amount: number }).amount) };
      if (!same(got, mine)) issues.push(`section-finance ${sectionId} ${name}: ${JSON.stringify(got)} != ${JSON.stringify(mine)}`);
    }
  }
  // the dashboard = the sum of the students (remaining and overdue per currency)
  const overview = await admin.get('/dashboard/overview');
  const sums: Record<string, { remaining: number; overdue: number }> = {};
  for (const m of Object.values(perStudentYear)) {
    for (const [c, v] of Object.entries(m)) {
      sums[c] ??= { remaining: 0, overdue: 0 };
      sums[c].remaining += v.remaining;
      sums[c].overdue += v.overdue;
    }
  }
  for (const row of overview.finance.currencies as { currency: string; remaining: unknown; overdue: unknown; collectedThisMonth: unknown }[]) {
    const want = sums[row.currency] ?? { remaining: 0, overdue: 0 };
    const got = { remaining: n(row.remaining), overdue: n(row.overdue) };
    if (Math.abs(got.remaining - want.remaining) > 0.001 || Math.abs(got.overdue - want.overdue) > 0.001) {
      issues.push(`dashboard ${row.currency}: ${JSON.stringify(got)} != students ${JSON.stringify(want)}`);
    }
  }
  // this month's collections: register total = dashboard = last chart point
  const register = await report('payments-register', { from: monthStart, to: today });
  const registerTotals: Record<string, number> = {};
  for (const b of register.blocks.filter((x) => x.type === 'table')) {
    for (const r of b.rows ?? []) if (isMoney(r.amount)) registerTotals[r.amount.currency] = (registerTotals[r.amount.currency] ?? 0) + r.amount.amount;
  }
  for (const row of overview.finance.currencies as { currency: string; collectedThisMonth: unknown }[]) {
    const chart = (overview.finance.monthly as { month: string; currency: string; amount: unknown }[]).find((p) => p.month === month && p.currency === row.currency);
    const values = [Math.round((registerTotals[row.currency] ?? 0) * 100), Math.round(n(row.collectedThisMonth) * 100), Math.round(n(chart?.amount) * 100)];
    if (new Set(values).size !== 1) issues.push(`collected ${month} ${row.currency}: register / dashboard / chart = ${values.map((v) => v / 100).join(' / ')}`);
  }

  // ── 2 + 3. attendance and marks, per student ──────────────────────────────
  for (const [i, { id, family }] of input.students.entries()) {
    if (!family || (input.sampleEvery && i % input.sampleEvery !== 0)) continue;
    const app = await family.get(`/mobile/students/${id}/attendance?month=${month}`);
    const att = await report('student-attendance', { studentId: id, from: monthStart, to: today });
    const monthly = await report('student-monthly', { studentId: id, from: monthStart, to: today });
    const rates = [app.ratePercent ?? null, statOf(att, 'نسبة الحضور') ?? null, statOf(monthly, 'نسبة الحضور') ?? null];
    if (new Set(rates.map(String)).size !== 1) issues.push(`attendance ${id} ${month}: app / report / family report = ${rates.join(' / ')}`);
    const counts = [app.counts.present, app.counts.late, app.counts.absent, app.counts.excused];
    const reportCounts = ['حاضر', 'متأخر', 'غائب', 'بعذر'].map((l) => statOf(att, l));
    if (!same(counts, reportCounts)) issues.push(`attendance ${id} ${month}: app counts ${counts} != report ${reportCounts}`);

    const results = await family.get(`/mobile/students/${id}/results`);
    const transcript = await report('student-transcript', { studentId: id, from: input.yearStart, to: today });
    const overall = statOf(transcript, 'المعدل العام') ?? null;
    if (String(results.averagePercent ?? null) !== String(overall)) issues.push(`marks ${id}: app ${results.averagePercent} != transcript ${overall}`);
  }

  // ── 4 + 5. database soundness ─────────────────────────────────────────────
  const sql = (text: string) => inst.s.prisma.$queryRawUnsafe<Record<string, unknown>[]>(text, inst.id);
  const checks: [string, string][] = [
    ['installment paid above its amount or negative', 'select id from installments where institute_id = $1 and (paid_amount > amount or paid_amount < 0)'],
    ['allocations of active payments != paid amount', `select i.id from installments i left join (select a.installment_id, sum(a.amount) s from payment_allocations a join payments p on p.id = a.payment_id where p.status = 'ACTIVE' group by 1) x on x.installment_id = i.id where i.institute_id = $1 and coalesce(x.s, 0) <> i.paid_amount`],
    ['receipt numbers not 1..N per branch and year', 'select branch_id, academic_year_id from payments where institute_id = $1 group by 1, 2 having min(receipt_number) <> 1 or max(receipt_number) <> count(*) or count(distinct receipt_number) <> count(*)'],
    ['the same notification twice for one person', `select user_id, type, title, body, (created_at at time zone 'Asia/Damascus')::date d from notifications where institute_id = $1 group by 1, 2, 3, 4, 5 having count(*) > 1`],
  ];
  for (const [label, text] of checks) {
    const rows = await sql(text);
    if (rows.length > 0) issues.push(`${label}: ${JSON.stringify(rows.slice(0, 5), (_, v) => (typeof v === 'bigint' ? Number(v) : v))}`);
  }
  return issues;
}
