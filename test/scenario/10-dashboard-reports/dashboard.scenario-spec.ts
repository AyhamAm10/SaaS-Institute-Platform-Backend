/**
 * [T7] 10.1 the dashboard home, every number exact. Plan: 10-dashboard-reports.md
 * Today: Wednesday 2026-11-18 11:00 (Damascus). Branches المزة (main) and المالكي.
 * Sections: A (المزة, 1,000,000 SYP), B (المزة, 600 USD), M (المالكي, 900,000 SYP).
 * Students: A 4 active + 1 withdrawn, B 2, M 3 -> 9 active; 2 with no enrollment.
 *   Created 2026-10-10, except: A4 on 2026-10-31 23:30 local (October), M3 on 2026-11-01 00:10 local
 *   and one unassigned on 2026-11-02 -> new this month = 2.
 * Teachers: 3 active + 1 deactivated -> 3.
 * Today: A 2 present + 1 late, B 1 present, M 1 present -> 4 / 1 / 0 excused / 4 not recorded,
 *   rate (5 / 9) = 55.6; section rows A 4/3, B 2/1, M 3/1.
 * Week: the last 7 working days without Friday 11-13 and the closure of Monday 11-16.
 * Money (contracts from 10-01, monthly):
 *   A1 1,000,000 x2 (10-01, 11-01), paid 500,000 on 10-05
 *   A2 1,000,000 x2, paid 200,000 on 10-31 23:30 local (October) and 300,000 on 11-01 00:30 local (November)
 *   B1 600 USD x2, paid 100 on 11-10
 *   M1 900,000 x1 (12-01), paid 50,000 on 11-15 and 70,000 the same day, then cancelled
 *   -> SYP collected this month 350,000, remaining 1,850,000, overdue 1,000,000 (2 installments)
 *   -> USD collected 100, remaining 500, overdue 500 (2 installments)
 *   -> monthly SYP: October 700,000, November 350,000, the 4 months before 0
 * Exams: A mathematics /20: A1 15 (75 %), A2 10 (50 %) -> A 62.5; B and M null.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { CHANGED_PASSWORD, InstituteFixture, signIn, signInPlatform } from '../support/builders';
import { uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { num } from '../support/money';

describe('[T7] 10.1 dashboard overview', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let malki: number;
  const sec: Record<string, number> = {};
  const st: Record<string, number> = {};
  const contract: Record<string, number> = {};
  let teacherPhone: string;

  const overview = (branchId?: number) => (branchId ? inst.admin.withContext({ branchId }) : inst.admin).get('/dashboard/overview');

  beforeAll(async () => {
    setClock('2026-10-10 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'لوحة التحكم');
    const ab = await inst.anyAcademicBranch();
    malki = await inst.branch('المالكي');
    const math = await inst.subject('الرياضيات');
    sec.A = await inst.section({ name: 'A', academicBranchId: ab, fee: 1_000_000 });
    sec.B = await inst.section({ name: 'B', academicBranchId: ab, fee: 600, currency: 'USD' });
    sec.M = await inst.section({ name: 'M', academicBranchId: ab, fee: 900_000, branchId: malki });
    await inst.admin.post(`/sections/${sec.A}/subjects`, { subjectId: math, weeklyPeriods: 5 });
    await inst.admin.post(`/sections/${sec.M}/subjects`, { subjectId: math, weeklyPeriods: 5 });

    const add = async (key: string, sectionId: number | undefined, branchId = inst.branchId) =>
      (st[key] = (await inst.student({ fullName: `طالب ${key}`, sectionId, branchId, newFamily: { familyName: `عائلة ${key}` } })).id);
    for (const k of ['A1', 'A2', 'A3', 'AW']) await add(k, sec.A);
    for (const k of ['B1', 'B2']) await add(k, sec.B);
    for (const k of ['M1', 'M2']) await add(k, sec.M, malki);
    await add('U1', undefined);
    setClock('2026-10-31 23:30');
    await add('A4', sec.A);
    setClock('2026-11-01 00:10');
    await add('M3', sec.M, malki);
    setClock('2026-11-02 09:00');
    await add('U2', undefined);
    await inst.admin.patch(`/enrollments/${await inst.enrollmentOf(st.AW)}/status`, { status: 'WITHDRAWN', reason: 'سفر' });

    for (const n of ['أ', 'ب', 'ج', 'د']) {
      const phone = uniquePhone();
      if (n === 'أ') teacherPhone = phone;
      await inst.admin.post('/teachers', { fullName: `أستاذ ${n}`, phone, branchIds: [inst.branchId] });
    }
    const last = await s.prisma.teacher.findFirstOrThrow({ where: { instituteId: inst.id, user: { fullName: 'أستاذ د' } } });
    await inst.admin.patch(`/accounts/${last.userId}/active`, { isActive: false });

    // money
    setClock('2026-10-01 09:00');
    for (const k of ['A1', 'A2', 'B1']) contract[k] = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st[k])}/contract`, { numberOfInstallments: 2, startDate: '2026-10-01' })).id;
    contract.M1 = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st.M1)}/contract`, { numberOfInstallments: 1, startDate: '2026-12-01' })).id;
    const pay = async (when: string, key: string, amount: number) => {
      setClock(when);
      return inst.admin.post(`/contracts/${contract[key]}/payments`, { amount });
    };
    await pay('2026-10-05 10:00', 'A1', 500_000);
    await pay('2026-10-31 23:30', 'A2', 200_000);
    await pay('2026-11-01 00:30', 'A2', 300_000);
    await pay('2026-11-10 10:00', 'B1', 100);
    await pay('2026-11-15 10:00', 'M1', 50_000);
    const wrong = await pay('2026-11-15 10:05', 'M1', 70_000);
    await inst.admin.patch(`/payments/${wrong.id}/cancel`, { reason: 'مبلغ خطأ' });

    // exams
    const exam = await inst.admin.post('/exams', { sectionId: sec.A, subjectId: math, title: 'مذاكرة', examDate: '2026-11-15', maxMark: 20, passMark: 10 });
    await inst.admin.put(`/exams/${exam.id}/results`, { results: [{ studentId: st.A1, mark: 15 }, { studentId: st.A2, mark: 10 }] });
    await inst.admin.post('/exams', { sectionId: sec.M, subjectId: math, title: 'مذاكرة المالكي', examDate: '2026-11-25', maxMark: 20, passMark: 10 });

    // attendance: a closure on Monday 11-16, then today
    await inst.admin.post('/closures', { scope: 'INSTITUTE', fromDate: '2026-11-16', toDate: '2026-11-16', reason: 'عطلة' });
    setClock('2026-11-18 07:55');
    for (const k of ['A1', 'A2', 'B1', 'M1']) await inst.admin.post('/attendance/check-in', { studentId: st[k] });
    setClock('2026-11-18 08:40');
    await inst.admin.post('/attendance/check-in', { studentId: st.A3 });
    setClock('2026-11-18 11:00');
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[DSH-01] students: 9 active, 2 unassigned (the withdrawn one is neither), 2 new this local month', async () => {
    const o = await overview();
    expect(o.students).toEqual({ active: 9, unassigned: 2, newThisMonth: 2 });
  });

  it('[DSH-02] teachers: 3 (the deactivated one is not counted)', async () => {
    expect((await overview()).teachers).toBe(3);
  });

  it('[DSH-03] today 4 present, 1 late, 4 not recorded -> 55.6; the week skips Friday and the closure', async () => {
    const o = await overview();
    expect(o.attendance.today).toMatchObject({ present: 4, late: 1, excused: 0, notRecorded: 4, rate: 55.6 });
    expect(o.attendance.week.map((p: { date: string }) => p.date)).toEqual([
      '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-14', '2026-11-15', '2026-11-17', '2026-11-18',
    ]);
    expect(o.attendance.week.at(-1)).toMatchObject({ attended: 5, recorded: 5, rate: 100 });
  });

  it('[DSH-04] finance per currency, the cancelled payment and the midnight edges counted right', async () => {
    const o = await overview();
    const rows = Object.fromEntries(o.finance.currencies.map((r: Record<string, unknown>) => [r.currency, [num(r.collectedThisMonth), num(r.remaining), num(r.overdue), r.overdueInstallments]]));
    expect(rows).toEqual({ SYP: [350_000, 1_850_000, 1_000_000, 2], USD: [100, 500, 500, 2] });
  });

  it('[DSH-05] collections chart: 6 months per currency, empty months 0, the 23:30 payment in October', async () => {
    const o = await overview();
    const syp = o.finance.monthly.filter((m: { currency: string }) => m.currency === 'SYP').map((m: { month: string; amount: unknown }) => [m.month, num(m.amount)]);
    expect(syp).toEqual([['2026-06', 0], ['2026-07', 0], ['2026-08', 0], ['2026-09', 0], ['2026-10', 700_000], ['2026-11', 350_000]]);
    const usd = o.finance.monthly.filter((m: { currency: string }) => m.currency === 'USD');
    expect(usd.map((m: { amount: unknown }) => num(m.amount))).toEqual([0, 0, 0, 0, 0, 100]);
  });

  it('[DSH-06] a row per section: active students, attended today, marks average (null without marks)', async () => {
    const o = await overview();
    const rows = Object.fromEntries(o.sections.map((r: { name: string; students: number; attendedToday: number; averagePercent: unknown }) =>
      [r.name, [r.students, r.attendedToday, r.averagePercent === null ? null : num(r.averagePercent)]]));
    expect(rows).toEqual({ A: [4, 3, 62.5], B: [2, 1, null], M: [3, 1, null] });
    expect(o.exams.upcoming.map((e: { title: string }) => e.title)).toEqual(['مذاكرة المالكي']);
  });

  it('[DSH-08] with a branch header every number is that branch only, and the two branches add up to the whole', async () => {
    const [all, mazzeh, mk] = [await overview(), await overview(inst.branchId), await overview(malki)];
    expect([mazzeh.students.active, mk.students.active]).toEqual([6, 3]);
    const today = (o: typeof all) => [o.attendance.today.present, o.attendance.today.late, o.attendance.today.notRecorded];
    expect(today(mazzeh).map((v, i) => v + today(mk)[i])).toEqual(today(all));
    const collected = (o: typeof all) => num(o.finance.currencies.find((r: { currency: string }) => r.currency === 'SYP')?.collectedThisMonth ?? 0);
    expect([collected(mazzeh), collected(mk)]).toEqual([300_000, 50_000]);
    expect(mazzeh.sections.map((r: { name: string }) => r.name).sort()).toEqual(['A', 'B']);
  });

  it('[DSH-09] a teacher has no dashboard (403); the accountant gets money and students but empty attendance and exams', async () => {
    const teacher = await signIn(s, teacherPhone);
    await teacher.fails('get', '/dashboard/overview', 403);
    const phone = uniquePhone();
    await inst.admin.post('/staff', { fullName: 'المحاسب', phone, role: 'ACCOUNTANT' });
    const acc = await signIn(s, phone);
    const o = await acc.get('/dashboard/overview');
    expect(o.students.active).toBe(9);
    expect(num(o.finance.currencies.find((r: { currency: string }) => r.currency === 'SYP').collectedThisMonth)).toBe(350_000);
    expect([o.attendance.today.present, o.exams.upcoming.length]).toEqual([0, 0]);
  });

  it('[DSH-07] an institute without any academic year: an empty overview, no error, and no year is created', async () => {
    const platform = await signInPlatform(s);
    const adminPhone = uniquePhone();
    await platform.post('/institutes', {
      name: 'معهد بلا سنة', timezone: 'Asia/Damascus', phone: '0113334455', address: 'دمشق', adminFullName: 'مدير', adminPhone, adminPassword: CHANGED_PASSWORD,
    });
    const admin = await signIn(s, adminPhone, CHANGED_PASSWORD);
    const o = await admin.get('/dashboard/overview');
    expect([o.academicYear, o.sections, o.finance.currencies.length]).toEqual([null, [], 0]);
    const user = await s.prisma.user.findFirstOrThrow({ where: { phone: adminPhone } });
    expect(await s.prisma.academicYear.count({ where: { instituteId: user.instituteId! } })).toBe(0);
  });
});
