/**
 * [T8] YEAR-C: two consecutive years. Plan: 11-full-year-scenarios.md
 * 2025-2026: section «التاسع 2025», six students, contracts 600,000 = 3 x 200,000 (2025-09-01, 10-01, 11-01).
 *   Everyone pays in full, except s5 who pays 200,000 only -> he still owes 400,000 at the end of that year.
 * 2026-2027 (made current on 2026-08-20): section «العاشر 2026». There is no automatic promotion (known gap):
 *   the test enrolls the students by hand. s1..s5 have their old enrollment COMPLETED first; s0 keeps both
 *   enrollments ACTIVE (the app must show the newest year). Contracts 900,000 = 3 x 300,000 from 2026-09-01.
 * Golden on 2026-11-28 for s5: this year paid 300,000 of 900,000 -> 600,000 left, all overdue (10-01 and 11-01);
 *   last year 400,000 still owed and overdue -> in total 1,500,000 / 500,000 / 1,000,000 / 1,000,000.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { num } from '../support/money';
import { reconcile } from '../support/reconcile';

// A whole year (or 2,000 students) per file: far beyond the default 2 minutes per test
jest.setTimeout(1_800_000);

describe('[T8] YEAR-C two consecutive years', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let year1: number;
  let year2: number;
  let section1: number;
  let section2: number;
  const st: number[] = [];
  const login: Api[] = [];
  const contract1: number[] = [];
  const contract2: number[] = [];

  const sypOf = (body: unknown) => {
    const rows = (Array.isArray(body) ? body : (body as { currencies?: unknown[]; totals?: unknown[] }).currencies ?? (body as { totals: unknown[] }).totals) as Record<string, unknown>[];
    const r = rows.find((x) => x.currency === 'SYP')!;
    return [num(r.total), num(r.paid), num(r.remaining), num(r.overdue)];
  };

  beforeAll(async () => {
    setClock('2025-09-01 08:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'سنتان', { name: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30' });
    year1 = inst.yearId;
    const ab = await inst.anyAcademicBranch();
    section1 = await inst.section({ name: 'التاسع 2025', academicBranchId: ab, fee: 600_000 });
    for (let i = 0; i < 6; i++) {
      const phone = uniquePhone();
      st.push((await inst.student({ fullName: `طالب ${i}`, sectionId: section1, newFamily: { familyName: `عائلة ${i}`, phone } })).id);
      login.push(await signIn(s, phone));
      contract1.push((await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st[i])}/contract`, { numberOfInstallments: 3, startDate: '2025-09-01' })).id);
    }
    setClock('2025-09-05 09:00');
    for (let i = 0; i < 6; i++) await inst.admin.post(`/contracts/${contract1[i]}/payments`, { amount: i === 5 ? 200_000 : 600_000 });
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[YEAR-C 1] the first year closes reconciled: 6 receipts 1..6, s5 owes 400,000', async () => {
    setClock('2026-06-28 20:00');
    expect(await reconcile({ inst, today: '2026-06-28', yearStart: '2025-09-01', students: st.map((id, i) => ({ id, family: login[i] })), sections: [section1] })).toEqual([]);
    expect(sypOf(await inst.admin.get(`/students/${st[5]}/financial-summary`))).toEqual([600_000, 200_000, 400_000, 400_000]);
  });

  it('[YEAR-C 2] the new year: manual enrollment (no promotion yet), new contracts, receipts start again at 1', async () => {
    setClock('2026-08-20 09:00');
    const y2 = await inst.admin.post('/academic-years', { name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', isCurrent: true });
    year2 = y2.id;
    const ab = await inst.anyAcademicBranch();
    const next = inst.admin.withContext({ academicYearId: year2 });
    section2 = (await next.post('/sections', { name: 'العاشر 2026', academicBranchId: ab, feeAmount: 900_000, feeCurrency: 'SYP', branchId: inst.branchId, academicYearId: year2 })).id;
    for (let i = 1; i < 6; i++) {
      const old = (await s.prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: st[i], academicYearId: year1 } })).id;
      await inst.admin.patch(`/enrollments/${old}/status`, { status: 'COMPLETED' });
    }
    // TODO(promotion): replace this manual enrollment when the yearly promotion exists
    const res = await next.post(`/sections/${section2}/enrollments`, { studentIds: st });
    expect(res.rejected).toEqual([]);
    for (let i = 0; i < 6; i++) {
      const enr = (await s.prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: st[i], academicYearId: year2 } })).id;
      contract2.push((await next.post(`/enrollments/${enr}/contract`, { numberOfInstallments: 3, startDate: '2026-09-01' })).id);
    }
    setClock('2026-09-05 09:00');
    for (let i = 0; i < 6; i++) await next.post(`/contracts/${contract2[i]}/payments`, { amount: 300_000 });
    const receipts = await s.prisma.payment.findMany({ where: { instituteId: inst.id }, orderBy: { id: 'asc' } });
    expect(receipts.filter((p) => p.academicYearId === year2).map((p) => p.receiptNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(receipts.filter((p) => p.academicYearId === year1).map((p) => p.receiptNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('[YEAR-C 3] the parents app shows the newest year for a child with two active enrollments', async () => {
    const o = await login[0].get(`/mobile/students/${st[0]}/overview`);
    expect(o.student.section).toMatchObject({ id: section2, name: 'العاشر 2026' });
  });

  it('[YEAR-C 4] last year\'s debt never disappears: summary, statement and the app all show 1,500,000 / 500,000 / 1,000,000 / 1,000,000', async () => {
    setClock('2026-11-28 20:00');
    const golden = [1_500_000, 500_000, 1_000_000, 1_000_000]; // this year 10-01 and 11-01 are both overdue (600,000) + 400,000 from last year
    expect(sypOf(await inst.admin.get(`/students/${st[5]}/financial-summary`))).toEqual(golden);
    const app = await login[5].get(`/mobile/students/${st[5]}/finance`);
    expect(sypOf(app.totals)).toEqual(golden);
    expect(app.contracts.map((c: { yearName: string }) => c.yearName).sort()).toEqual(['2025-2026', '2026-2027']);
    const overview = await login[5].get(`/mobile/students/${st[5]}/overview`);
    expect(overview.finance.nextDue).toEqual({ amount: 200_000, currency: 'SYP', dueDate: '2025-10-01' });
  });

  it('[YEAR-C 5] each year reads with its own header: dashboard and register; the new year reconciles', async () => {
    const y1 = inst.admin.withContext({ academicYearId: year1 });
    const y2 = inst.admin.withContext({ academicYearId: year2 });
    const [o1, o2] = [await y1.get('/dashboard/overview'), await y2.get('/dashboard/overview')];
    expect([o1.academicYear.id, o2.academicYear.id]).toEqual([year1, year2]);
    expect([o1.sections.map((x: { name: string }) => x.name), o2.sections.map((x: { name: string }) => x.name)]).toEqual([['التاسع 2025'], ['العاشر 2026']]);
    const reg = async (api: Api) => {
      const d = await api.get('/reports/payments-register?from=2025-09-01&to=2026-11-28');
      return d.blocks.find((b: { type: string }) => b.type === 'table').rows.length;
    };
    expect([await reg(y1), await reg(y2)]).toEqual([6, 6]);
    expect(await reconcile({ inst, today: '2026-11-28', yearStart: '2026-09-01', yearName: '2026-2027', students: st.map((id, i) => ({ id, family: login[i] })), sections: [section2] })).toEqual([]);
    // OPEN DECISION (owner): the institute-level money views are per year. Working in the new year, the
    // overdue report lists only this year's installments; last year's 400,000 shows only per student
    // (summary, statement, app) or with last year's header. Pinned as is until the owner decides.
    const dueOf = async (api: Api) => {
      const aging = await api.get('/reports/overdue-aging');
      return aging.blocks.find((b: { title?: string }) => b.title === 'التفاصيل').rows.filter((r: { student: string }) => r.student === 'طالب 5').map((r: { due: string }) => r.due);
    };
    expect(await dueOf(y2)).toEqual(['2026-10-01', '2026-11-01']);
    expect(await dueOf(y1)).toEqual(['2025-10-01', '2025-11-01']);
  });
});
