/**
 * [T8] YEAR-B: two branches, two currencies, September -> December 2026. Plan: 11-full-year-scenarios.md
 * المزة: section A in pounds, 1,200,000 = 6 x 200,000 from 09-01. المالكي: section M in dollars, 600 = 6 x 100 from 09-01.
 * Family الخطيب: يزن in A (المزة) and سلمى in M (المالكي). Four more students in each section.
 * رامي teaches mathematics in both sections (both branches).
 * Payments in the other currency, the rate changes every month:
 *   سلمى (USD contract): 10-05 1,300,000 SYP at 13,000 = 100 USD; 11-05 700,000 SYP at 14,000 = 50 USD; 12-05 100 USD.
 *   يزن (SYP contract): 10-05 200,000 SYP; 11-05 20 USD at 15,000 = 300,000 SYP.
 *   The other students pay one installment a month in their contract currency (Sep..Dec).
 * On 12-28: يزن paid 500,000, remaining 700,000, overdue 300,000 (Sep..Dec due = 800,000);
 *   سلمى paid 250, remaining 350, overdue 150 (Sep..Dec due = 400).
 * المالكي is closed on 11-10: its students get no absence that day.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { AttendanceProcessor } from '../../../src/modules/attendance/jobs/attendance.processor';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { num } from '../support/money';
import { reconcile } from '../support/reconcile';

// A whole year (or 2,000 students) per file: far beyond the default 2 minutes per test
jest.setTimeout(1_800_000);

describe('[T8] YEAR-B two branches, two currencies', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let malki: number;
  let family: Api;
  let familyId: number;
  let rami: number;
  const sec: Record<string, number> = {};
  const students: { id: number; section: 'A' | 'M'; login: Api | null }[] = [];
  const contractOf = new Map<number, number>();
  let yazan: number;
  let salma: number;

  const reconcileNow = (today: string) =>
    reconcile({ inst, today, yearStart: '2026-09-01', students: students.map((x) => ({ id: x.id, family: x.login })), sections: [sec.A, sec.M] });

  const payOne = async (studentId: number) => {
    const open = await s.prisma.installment.findFirst({ where: { subscriptionId: contractOf.get(studentId)!, status: { not: 'PAID' } }, orderBy: { installmentNumber: 'asc' } });
    if (open) await inst.admin.post(`/contracts/${contractOf.get(studentId)}/payments`, { amount: Number(open.amount) - Number(open.paidAmount) });
  };

  const attendanceDay = async (date: string) => {
    setClock(`${date} 07:55`);
    for (const [key, sectionId] of Object.entries(sec)) {
      const ids = students.filter((x) => x.section === key).map((x) => x.id);
      const res = await inst.admin.post('/attendance/bulk', { sectionId, action: 'check-in', studentIds: ids.slice(1) });
      void res;
    }
    setClock(`${date} 14:00`);
    await s.runJob(AttendanceProcessor, 'mark-absences', inst.id);
  };

  beforeAll(async () => {
    setClock('2026-09-01 08:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'السنة ب');
    malki = await inst.branch('المالكي');
    const ab = await inst.anyAcademicBranch();
    const math = await inst.subject('الرياضيات');
    const t = await inst.admin.post('/teachers', { fullName: 'أ. رامي', phone: uniquePhone(), branchIds: [inst.branchId, malki], qualifications: [{ academicBranchId: ab, subjectId: math }] });
    rami = t.id ?? t.teacher?.id;
    sec.A = await inst.section({ name: 'A', academicBranchId: ab, fee: 1_200_000 });
    sec.M = await inst.section({ name: 'M', academicBranchId: ab, fee: 600, currency: 'USD', branchId: malki });
    for (const id of Object.values(sec)) await inst.admin.post(`/sections/${id}/subjects`, { subjectId: math, weeklyPeriods: 5, teacherId: rami });
    await inst.admin.post('/rooms', { name: 'قاعة المزة', capacity: 30, branchId: inst.branchId });
    await inst.admin.post('/rooms', { name: 'قاعة المالكي', capacity: 30, branchId: malki });

    const phone = uniquePhone();
    const y = await inst.student({ fullName: 'يزن الخطيب', sectionId: sec.A, newFamily: { familyName: 'الخطيب', fatherName: 'محمد', phone } });
    yazan = y.id;
    familyId = y.familyId;
    salma = (await inst.student({ fullName: 'سلمى الخطيب', gender: 'FEMALE', sectionId: sec.M, familyId, branchId: malki })).id;
    family = await signIn(s, phone);
    students.push({ id: yazan, section: 'A', login: family }, { id: salma, section: 'M', login: family });
    for (let i = 0; i < 4; i++) {
      for (const key of ['A', 'M'] as const) {
        const p = uniquePhone();
        const id = (await inst.student({ fullName: `طالب ${key}${i}`, sectionId: sec[key], branchId: key === 'M' ? malki : inst.branchId, newFamily: { familyName: `عائلة ${key}${i}`, phone: p } })).id;
        students.push({ id, section: key, login: await signIn(s, p) });
      }
    }
    for (const x of students) {
      contractOf.set(x.id, (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(x.id)}/contract`, { numberOfInstallments: 6, startDate: '2026-09-01' })).id);
    }
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  const others = () => students.filter((x) => x.id !== yazan && x.id !== salma);

  it('[YEAR-B 09] the teacher of both branches gets one timetable without a clash; two receipt counters; reconciled', async () => {
    await inst.admin.post(`/academic-years/${inst.yearId}/timetable/generate`, {});
    const mine = await s.prisma.timetableEntry.findMany({ where: { teacherId: rami }, include: { timetable: true } });
    expect(mine).toHaveLength(10);
    expect(new Set(mine.map((e) => e.timetable.sectionId))).toEqual(new Set([sec.A, sec.M]));
    expect(new Set(mine.map((e) => `${e.dayOfWeek} ${e.startTime}`)).size).toBe(10);
    setClock('2026-09-05 09:00');
    for (const x of others()) await payOne(x.id);
    const receipts = await s.prisma.payment.findMany({ where: { instituteId: inst.id }, orderBy: { id: 'asc' } });
    const byBranch = (b: number) => receipts.filter((p) => p.branchId === b).map((p) => p.receiptNumber);
    expect([byBranch(inst.branchId), byBranch(malki)]).toEqual([[1, 2, 3, 4], [1, 2, 3, 4]]);
    await attendanceDay('2026-09-10');
    setClock('2026-09-28 20:00');
    expect(await reconcileNow('2026-09-28')).toEqual([]);
  });

  it('[YEAR-B 10] October: dollars paid in pounds at 13,000; reconciled', async () => {
    setClock('2026-10-05 09:00');
    const p = await inst.admin.post(`/contracts/${contractOf.get(salma)}/payments`, { amount: 1_300_000, currency: 'SYP', exchangeRate: 13_000 });
    expect([num(p.amount), num(p.appliedAmount)]).toEqual([1_300_000, 100]);
    await inst.admin.post(`/contracts/${contractOf.get(yazan)}/payments`, { amount: 200_000 });
    for (const x of others()) await payOne(x.id);
    await attendanceDay('2026-10-12');
    setClock('2026-10-28 20:00');
    expect(await reconcileNow('2026-10-28')).toEqual([]);
  });

  it('[YEAR-B 11] November: rates 14,000 and 15,000 both ways; the المالكي holiday; reconciled', async () => {
    setClock('2026-11-01 08:00');
    await inst.admin.post('/closures', { scope: 'BRANCH', branchId: malki, fromDate: '2026-11-10', toDate: '2026-11-10', reason: 'صيانة' });
    setClock('2026-11-05 09:00');
    await inst.admin.post(`/contracts/${contractOf.get(salma)}/payments`, { amount: 700_000, currency: 'SYP', exchangeRate: 14_000 });
    const p = await inst.admin.post(`/contracts/${contractOf.get(yazan)}/payments`, { amount: 20, currency: 'USD', exchangeRate: 15_000 });
    expect([num(p.amount), num(p.appliedAmount)]).toEqual([20, 300_000]);
    for (const x of others()) await payOne(x.id);
    // on the closure day only المزة records attendance; the job marks no absence in المالكي
    setClock('2026-11-10 07:55');
    await inst.admin.post('/attendance/bulk', { sectionId: sec.A, action: 'check-in', studentIds: students.filter((x) => x.section === 'A').map((x) => x.id).slice(1) });
    setClock('2026-11-10 14:00');
    await s.runJob(AttendanceProcessor, 'mark-absences', inst.id);
    const day = await s.prisma.dailyAttendance.findMany({ where: { instituteId: inst.id, date: new Date('2026-11-10') } });
    expect(day.filter((r) => r.branchId === malki)).toHaveLength(0);
    expect(day.filter((r) => r.status === 'ABSENT').map((r) => r.studentId)).toEqual([yazan]);
    setClock('2026-11-28 20:00');
    expect(await reconcileNow('2026-11-28')).toEqual([]);
  });

  it('[YEAR-B 12] December: the family summary has one line per currency; the branch header splits every number', async () => {
    setClock('2026-12-05 09:00');
    await inst.admin.post(`/contracts/${contractOf.get(salma)}/payments`, { amount: 100 });
    for (const x of others()) await payOne(x.id);
    setClock('2026-12-28 20:00');
    expect(await reconcileNow('2026-12-28')).toEqual([]);

    const summary = await inst.admin.get(`/families/${familyId}/financial-summary`);
    const rows = (summary.totals ?? summary) as Record<string, unknown>[];
    expect(Object.fromEntries(rows.map((r) => [r.currency, [num(r.total), num(r.paid), num(r.remaining), num(r.overdue)]]))).toEqual({
      SYP: [1_200_000, 500_000, 700_000, 300_000],
      USD: [600, 250, 350, 150],
    });
    const app = await family.get(`/mobile/students/${salma}/finance`);
    expect(app.totals.map((r: Record<string, unknown>) => [r.currency, num(r.paid), num(r.remaining)])).toEqual([['USD', 250, 350]]);

    const all = await inst.admin.get('/dashboard/overview');
    const parts = [await inst.admin.withContext({ branchId: inst.branchId }).get('/dashboard/overview'), await inst.admin.withContext({ branchId: malki }).get('/dashboard/overview')];
    expect(parts[0].students.active + parts[1].students.active).toBe(all.students.active);
    for (const currency of ['SYP', 'USD']) {
      const pick = (o: typeof all, field: string) => num(o.finance.currencies.find((r: { currency: string }) => r.currency === currency)?.[field] ?? 0);
      for (const field of ['collectedThisMonth', 'remaining', 'overdue']) {
        expect([currency, field, pick(parts[0], field) + pick(parts[1], field)]).toEqual([currency, field, pick(all, field)]);
      }
    }
  });
});
