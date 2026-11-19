/**
 * [T7] 9.1-9.2 parents/students app: ownership and the numbers it shows. Plan: 09-mobile-teacher-api.md
 * Family الخطيب: يزن (التاسع - أ, main branch, studies mathematics only) and سلمى (العاشر, branch المالكي).
 * يزن also has his own student account. Another family: عمر العمر (التاسع - أ).
 * Fees of يزن: 1,000,000 in 3 installments from 2026-09-01 -> 333,333 (09-01) / 333,333 (10-01) / 333,334 (11-01).
 *   Paid 500,000 on 09-05 -> #1 paid, #2 paid 166,667 (remaining 166,666), #3 untouched.
 *   On Tue 2026-11-10: total 1,000,000 / paid 500,000 / remaining 500,000 / overdue 500,000;
 *   next due = #2 (oldest unpaid, although overdue) for its remaining 166,666.
 *   On 2026-10-15 instead: #2 OVERDUE, #3 still PENDING in the database -> shown DUE.
 * Branch المالكي is closed on 2026-11-10 only.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { num } from '../support/money';

const ROUTES = ['overview', 'attendance', 'timetable', 'results', 'notes', 'finance', 'profile'];

describe('[T7] 9.1-9.2 mobile api', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let family: Api;
  let student: Api;
  let other: Api;
  let yazan: number;
  let salma: number;
  let omar: number;
  let contractId: number;
  const subj: Record<string, number> = {};
  const phones: Record<string, string> = {};

  beforeAll(async () => {
    setClock('2026-09-01 08:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'التطبيقات');
    const ab = await inst.anyAcademicBranch();
    const malki = await inst.branch('المالكي');
    subj.math = await inst.subject('الرياضيات');
    subj.phys = await inst.subject('الفيزياء');
    const teacherPhone = uniquePhone();
    const t = await inst.admin.post('/teachers', {
      fullName: 'أ. رامي الحلبي', phone: teacherPhone, branchIds: [inst.branchId], qualifications: [{ academicBranchId: ab, subjectId: subj.math }],
    });
    const a9 = await inst.section({ name: 'التاسع - أ', academicBranchId: ab, fee: 1_000_000 });
    const a10 = await inst.section({ name: 'العاشر', academicBranchId: ab, branchId: malki });
    await inst.admin.post(`/sections/${a9}/subjects`, { subjectId: subj.math, weeklyPeriods: 5, teacherId: t.id ?? t.teacher?.id });
    await inst.admin.post(`/sections/${a9}/subjects`, { subjectId: subj.phys, weeklyPeriods: 3 });

    phones.family = uniquePhone();
    const y = await inst.student({ fullName: 'يزن الخطيب', sectionId: a9, newFamily: { familyName: 'الخطيب', fatherName: 'محمد', phone: phones.family } });
    yazan = y.id;
    salma = (await inst.student({ fullName: 'سلمى الخطيب', gender: 'FEMALE', sectionId: a10, familyId: y.familyId, branchId: malki })).id;
    phones.other = uniquePhone();
    omar = (await inst.student({ fullName: 'عمر العمر', sectionId: a9, newFamily: { familyName: 'العمر', fatherName: 'أحمد', phone: phones.other } })).id;
    phones.student = uniquePhone();
    await inst.admin.post('/accounts/students', { studentId: yazan, phone: phones.student });
    await inst.admin.put(`/enrollments/${await inst.enrollmentOf(yazan)}/subjects`, { subjectIds: [subj.math] });

    contractId = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(yazan)}/contract`, { numberOfInstallments: 3, startDate: '2026-09-01' })).id;
    setClock('2026-09-05 10:00');
    await inst.admin.post(`/contracts/${contractId}/payments`, { amount: 500_000 });

    // timetable of التاسع - أ: Tuesday 08:00 and 08:45, Sunday 09:30
    const path = `/academic-years/${inst.yearId}/sections/${a9}/timetable/entries`;
    const tid = t.id ?? t.teacher?.id;
    await inst.admin.post(path, { subjectId: subj.math, teacherId: tid, dayOfWeek: 2, startTime: '08:45', endTime: '09:30' });
    await inst.admin.post(path, { subjectId: subj.math, teacherId: tid, dayOfWeek: 2, startTime: '08:00', endTime: '08:45' });
    await inst.admin.post(path, { subjectId: subj.math, teacherId: tid, dayOfWeek: 0, startTime: '09:30', endTime: '10:15' });

    // exams: past math, future math (x2), future physics (يزن does not study it)
    await inst.admin.post('/exams', { sectionId: a9, subjectId: subj.math, title: 'مذاكرة سابقة', examDate: '2026-11-05', maxMark: 20, passMark: 10 });
    await inst.admin.post('/exams', { sectionId: a9, subjectId: subj.math, title: 'رياضيات اليوم', examDate: '2026-11-10', maxMark: 20, passMark: 10 });
    await inst.admin.post('/exams', { sectionId: a9, subjectId: subj.math, title: 'رياضيات قادمة', examDate: '2026-11-20', maxMark: 20, passMark: 10 });
    await inst.admin.post('/exams', { sectionId: a9, subjectId: subj.phys, title: 'فيزياء قادمة', examDate: '2026-11-12', maxMark: 20, passMark: 10 });

    await inst.admin.post('/closures', { scope: 'BRANCH', branchId: malki, fromDate: '2026-11-10', toDate: '2026-11-10', reason: 'صيانة' });
    setClock('2026-11-10 10:00');
    family = await signIn(s, phones.family);
    student = await signIn(s, phones.student);
    other = await signIn(s, phones.other);
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[MOB-01] the family sees both children although they are in two branches', async () => {
    const me = await family.get('/mobile/me');
    expect(me.role).toBe('FAMILY');
    expect(me.children.map((c: { id: number }) => c.id).sort()).toEqual([yazan, salma].sort());
    expect(new Set(me.children.map((c: { branch: { name: string } }) => c.branch.name)).size).toBe(2);
  });

  it('[MOB-02] the student account sees only himself', async () => {
    const me = await student.get('/mobile/me');
    expect([me.role, me.children.map((c: { id: number }) => c.id)]).toEqual(['STUDENT', [yazan]]);
  });

  it('[MOB-03] another family gets 404 on every one of the 7 routes of يزن', async () => {
    for (const r of ROUTES) await other.fails('get', `/mobile/students/${yazan}/${r}`, 404);
  });

  it('[MOB-04/05] the student: his sister is 404; finance and notes are family only (403)', async () => {
    await student.fails('get', `/mobile/students/${salma}/overview`, 404);
    await student.fails('get', `/mobile/students/${yazan}/finance`, 403);
    await student.fails('get', `/mobile/students/${yazan}/notes`, 403);
    expect((await student.get(`/mobile/students/${yazan}/overview`)).finance).toBeNull();
  });

  it('[MOB-11] a closure of the المالكي branch: سلمى has no school today, يزن does', async () => {
    const [y, sa] = await Promise.all([family.get(`/mobile/students/${yazan}/overview`), family.get(`/mobile/students/${salma}/overview`)]);
    expect([y.today.isWorkingDay, sa.today.isWorkingDay]).toEqual([true, false]);
    expect(sa.today.lessons).toEqual([]);
    // today is Tuesday: his two lessons, in time order
    expect(y.today.lessons.map((l: { startTime: string; subject: string }) => [l.startTime, l.subject])).toEqual([['08:00', 'الرياضيات'], ['08:45', 'الرياضيات']]);
  });

  it('[MOB-13/14] finance: 1,000,000 / 500,000 / 500,000 / overdue 500,000; next due = installment 2 for 166,666', async () => {
    const f = await family.get(`/mobile/students/${yazan}/finance`);
    expect(f.totals.map((t: Record<string, unknown>) => [t.currency, num(t.total), num(t.paid), num(t.remaining), num(t.overdue)]))
      .toEqual([['SYP', 1_000_000, 500_000, 500_000, 500_000]]);
    expect(f.contracts[0].installments.map((i: Record<string, unknown>) => [i.number, i.dueDate, num(i.amount), num(i.paid), num(i.remaining), i.status])).toEqual([
      [1, '2026-09-01', 333_333, 333_333, 0, 'PAID'],
      [2, '2026-10-01', 333_333, 166_667, 166_666, 'OVERDUE'],
      [3, '2026-11-01', 333_334, 0, 333_334, 'OVERDUE'],
    ]);
    const o = await family.get(`/mobile/students/${yazan}/overview`);
    expect(o.finance.nextDue).toEqual({ amount: 166_666, currency: 'SYP', dueDate: '2026-10-01' });
  });

  it('[MOB-15] on 10-15 the third installment (PENDING in the database) is shown DUE', async () => {
    setClock('2026-10-15 10:00');
    try {
      const f = await family.get(`/mobile/students/${yazan}/finance`);
      expect(f.contracts[0].installments.map((i: { status: string }) => i.status)).toEqual(['PAID', 'OVERDUE', 'DUE']);
      expect(f.totals[0].overdue).toBe(166_666);
      const db = await s.prisma.installment.findMany({ where: { subscriptionId: contractId }, orderBy: { installmentNumber: 'asc' } });
      expect(db[2].status).toBe('PENDING');
    } finally {
      setClock('2026-11-10 10:00');
    }
  });

  it('[MOB-16] payments: newest first, cancelled ones listed with their status, receipt number as text', async () => {
    const second = await inst.admin.post(`/contracts/${contractId}/payments`, { amount: 100_000 });
    setClock('2026-11-10 11:00');
    await inst.admin.patch(`/payments/${second.id}/cancel`, { reason: 'خطأ في المبلغ' });
    const f = await family.get(`/mobile/students/${yazan}/finance`);
    expect(f.payments.map((p: Record<string, unknown>) => [p.date, num(p.amount), p.status, typeof p.receiptNumber])).toEqual([
      ['2026-11-10', 100_000, 'CANCELLED', 'string'],
      ['2026-09-05', 500_000, 'ACTIVE', 'string'],
    ]);
    expect(num(f.totals[0].paid)).toBe(500_000);
  });

  it('[MOB-17] timetable: 6 working days, Saturday first, empty days kept with no slots, lessons in order', async () => {
    const tt = await family.get(`/mobile/students/${yazan}/timetable`);
    expect(tt.days.map((d: { weekday: string }) => d.weekday)).toEqual(['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY']);
    expect(tt.days.map((d: { slots: unknown[] }) => d.slots.length)).toEqual([0, 1, 0, 2, 0, 0]);
    expect(tt.days[3].slots.map((x: { startTime: string }) => x.startTime)).toEqual(['08:00', '08:45']);
    expect(tt.days[1].slots[0]).toMatchObject({ subject: 'الرياضيات', teacher: 'أ. رامي الحلبي', room: null });
  });

  it('[MOB-18] upcoming exams: today and later, only subjects he studies (no physics), soonest first', async () => {
    const r = await family.get(`/mobile/students/${yazan}/results`);
    expect(r.upcoming.map((e: { title: string; date: string }) => [e.date, e.title])).toEqual([
      ['2026-11-10', 'رياضيات اليوم'],
      ['2026-11-20', 'رياضيات قادمة'],
    ]);
    // عمر studies everything: he also sees the physics exam
    const o = await other.get(`/mobile/students/${omar}/results`);
    expect(o.upcoming.map((e: { title: string }) => e.title)).toContain('فيزياء قادمة');
  });

  it('[MOB-06] a family account deactivated during the session: the next request is 401', async () => {
    const userId = (await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, phone: phones.other } })).id;
    await inst.admin.patch(`/accounts/${userId}/active`, { isActive: false });
    await other.fails('get', '/mobile/me', 401);
  });
});
