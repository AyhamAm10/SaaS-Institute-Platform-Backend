/**
 * [T3] 5.4 automatic absences, 5.5 closures. Plan: 05-attendance-closures.md
 * Branch المزة: section أ (A0..A3), section ب (B0, B1); branch المالكي: section ج (C0, C1).
 * A1 (section أ) and B0 (section ب) are siblings of family الخطيب.
 * Calendar: Wed 11-18, Fri 11-20 (weekend), Sat 11-21, Sun 11-22, Mon 11-23, Tue 11-24, Wed 11-25.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { AttendanceProcessor } from '../../../src/modules/attendance/jobs/attendance.processor';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

describe('[T3] 5.4-5.5 automatic absences and closures', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let malki: number;
  const sec: Record<string, number> = {};
  const A: number[] = [];
  const B: number[] = [];
  const C: number[] = [];
  let familyPhone: string;

  const day = (d: string) => new Date(`${d}T00:00:00Z`);
  const absents = (d: string) =>
    s.prisma.dailyAttendance.findMany({ where: { instituteId: inst.id, date: day(d), status: 'ABSENT' }, select: { studentId: true } })
      .then((r) => r.map((x) => x.studentId).sort((x, y) => x - y));
  const runAbsenceJob = () => s.runJob(AttendanceProcessor, 'mark-absences', inst.id);
  const sorted = (ids: number[]) => [...ids].sort((x, y) => x - y);

  beforeAll(async () => {
    setClock('2026-11-18 07:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الغياب والعطل');
    malki = await inst.branch('المالكي');
    const ab = await inst.anyAcademicBranch();
    sec.a = await inst.section({ name: 'شعبة أ', academicBranchId: ab });
    sec.b = await inst.section({ name: 'شعبة ب', academicBranchId: ab });
    sec.c = await inst.section({ name: 'شعبة ج', academicBranchId: ab, branchId: malki });
    familyPhone = uniquePhone();
    const sibling = await inst.student({ fullName: 'يزن الخطيب', sectionId: sec.a, newFamily: { familyName: 'الخطيب', fatherName: 'محمد', phone: familyPhone } });
    A.push((await inst.student({ fullName: 'أ0', sectionId: sec.a, newFamily: { familyName: 'أ0' } })).id, sibling.id);
    for (const n of ['أ2', 'أ3']) A.push((await inst.student({ fullName: n, sectionId: sec.a, newFamily: { familyName: n } })).id);
    B.push((await inst.student({ fullName: 'سلمى الخطيب', gender: 'FEMALE', sectionId: sec.b, familyId: sibling.familyId })).id);
    B.push((await inst.student({ fullName: 'ب1', sectionId: sec.b, newFamily: { familyName: 'ب1' } })).id);
    for (const n of ['ج0', 'ج1']) C.push((await inst.student({ fullName: n, sectionId: sec.c, branchId: malki, newFamily: { familyName: n } })).id);
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[ATT-30] before the close time (13:59) the job writes nothing', async () => {
    setClock('2026-11-18 08:00');
    for (const id of [A[0], A[1], A[2]]) await inst.admin.post('/attendance/check-in', { studentId: id });
    setClock('2026-11-18 13:59');
    await runAbsenceJob();
    expect(await absents('2026-11-18')).toEqual([]);
  });

  it('[ATT-31/32] at 14:00 exactly the 5 active students without a record become ABSENT; a second run adds nothing', async () => {
    setClock('2026-11-18 14:00');
    await runAbsenceJob();
    expect(await absents('2026-11-18')).toEqual(sorted([A[3], B[0], B[1], C[0], C[1]]));
    await runAbsenceJob();
    expect(await s.prisma.dailyAttendance.count({ where: { instituteId: inst.id, date: day('2026-11-18') } })).toBe(8);
  });

  it('[ATT-33] the weekly holiday (Friday) gets no absences', async () => {
    setClock('2026-11-20 15:00');
    await runAbsenceJob();
    expect(await absents('2026-11-20')).toEqual([]);
  });

  it('[CLO-01] an institute closure: no check-in, no excuse, no absences; the daily view says closed', async () => {
    setClock('2026-11-19 10:00');
    await inst.admin.post('/closures', { scope: 'INSTITUTE', fromDate: '2026-11-21', toDate: '2026-11-21', reason: 'عيد' });
    setClock('2026-11-21 08:00');
    const err = await inst.admin.fails('post', '/attendance/check-in', 400, { studentId: A[0] });
    expect(err.message).toBe('This day is a holiday for the student: attendance cannot be recorded');
    await inst.admin.fails('post', '/attendance/excuse', 400, { studentId: A[0], date: '2026-11-21' });
    setClock('2026-11-21 15:00');
    await runAbsenceJob();
    expect(await absents('2026-11-21')).toEqual([]);
    const daily = await inst.admin.get(`/attendance/daily?sectionId=${sec.a}&date=2026-11-21`);
    expect([daily.isWorkingDay, daily.closure?.reason]).toEqual([false, 'عيد']);
  });

  it('[CLO-02] a branch closure (المالكي): the other branch works and only it gets absences', async () => {
    setClock('2026-11-21 16:00');
    await inst.admin.post('/closures', { scope: 'BRANCH', branchId: malki, fromDate: '2026-11-22', toDate: '2026-11-22', reason: 'صيانة' });
    setClock('2026-11-22 08:00');
    await inst.admin.post('/attendance/check-in', { studentId: A[0] });
    await inst.admin.fails('post', '/attendance/check-in', 400, { studentId: C[0] });
    setClock('2026-11-22 14:00');
    await runAbsenceJob();
    expect(await absents('2026-11-22')).toEqual(sorted([A[1], A[2], A[3], B[0], B[1]]));
  });

  it('[CLO-03] a section closure is per child: same family, one child off and one at school', async () => {
    setClock('2026-11-22 16:00');
    await inst.admin.withContext({ branchId: inst.branchId, academicYearId: inst.yearId })
      .post('/closures', { scope: 'SECTION', sectionIds: [sec.b], fromDate: '2026-11-23', toDate: '2026-11-23', reason: 'رحلة' });
    setClock('2026-11-23 09:00');
    const family = await signIn(s, familyPhone);
    const yazan = await family.get(`/mobile/students/${A[1]}/overview`);
    const salma = await family.get(`/mobile/students/${B[0]}/overview`);
    expect([yazan.today.isWorkingDay, salma.today.isWorkingDay]).toEqual([true, false]);
  });

  it('[CLO-04] a closure declared after the job ran removes ONLY the automatic absences of that day', async () => {
    setClock('2026-11-24 08:00');
    await inst.admin.post('/attendance/check-in', { studentId: A[0] });
    await inst.admin.post('/attendance/excuse', { studentId: A[1], date: '2026-11-24', note: 'مرض' });
    setClock('2026-11-24 14:00');
    await runAbsenceJob();
    expect(await absents('2026-11-24')).toEqual(sorted([A[2], A[3], B[0], B[1], C[0], C[1]]));

    setClock('2026-11-25 09:00');
    await inst.admin.post('/closures', { scope: 'INSTITUTE', fromDate: '2026-11-24', toDate: '2026-11-24', reason: 'عطلة طارئة' });
    await runAbsenceJob();
    expect(await absents('2026-11-24')).toEqual([]);
    const kept = await s.prisma.dailyAttendance.findMany({ where: { instituteId: inst.id, date: day('2026-11-24') }, select: { studentId: true, status: true } });
    expect(kept.map((r) => [r.studentId, r.status]).sort()).toEqual([[A[0], 'PRESENT'], [A[1], 'EXCUSED']].sort());
  });

  it('[CLO-05] removing the closure does not bring the absences back (no back-fill)', async () => {
    const closure = await s.prisma.closure.findFirstOrThrow({ where: { instituteId: inst.id, reason: 'عطلة طارئة' } });
    await inst.admin.del(`/closures/${closure.id}`);
    await runAbsenceJob();
    expect(await absents('2026-11-24')).toEqual([]);
  });

  it('[ATT-34] a close time of 12:00 writes the absences from 12:00', async () => {
    // The settings form always saves the whole schedule
    const cfg = await inst.admin.get('/schedule-config');
    await inst.admin.patch('/schedule-config', {
      workingDays: cfg.workingDays,
      dayStartTime: cfg.dayStartTime,
      dayEndTime: cfg.dayEndTime,
      periodDurationMinutes: cfg.periodDurationMinutes,
      breaks: (cfg.breaks ?? []).map((b: { name?: string; startTime: string; endTime: string }) => ({ name: b.name, startTime: b.startTime, endTime: b.endTime })),
      lateAfterMinutes: cfg.lateAfterMinutes,
      attendanceCloseTime: '12:00',
    });
    setClock('2026-11-26 11:59');
    await runAbsenceJob();
    expect(await absents('2026-11-26')).toEqual([]);
    setClock('2026-11-26 12:00');
    await runAbsenceJob();
    expect(await absents('2026-11-26')).toHaveLength(8);
  });

  it('[CLO-06] impossible closures are refused', async () => {
    const api = inst.admin.withContext({ branchId: inst.branchId, academicYearId: inst.yearId });
    await api.fails('post', '/closures', 400, { scope: 'INSTITUTE', fromDate: '2027-01-02', toDate: '2027-01-01', reason: 'خطأ' });
    await api.fails('post', '/closures', 400, { scope: 'INSTITUTE', fromDate: '2027-01-01', toDate: '2028-01-03', reason: 'طويلة' });
    await api.fails('post', '/closures', 400, { scope: 'SECTION', sectionIds: [], fromDate: '2027-01-01', toDate: '2027-01-01', reason: 'بلا شعب' });
    await api.fails('post', '/closures', 400, { scope: 'BRANCH', fromDate: '2027-01-01', toDate: '2027-01-01', reason: 'بلا فرع' });
  });
});
