/**
 * [T3] 5.6 Attendance numbers on every screen. Plan: 05-attendance-closures.md
 *
 * 30-day window ending Wed 2026-11-18 = 10-20 .. 11-18: 26 working days (Fridays 10-23, 10-30,
 * 11-06, 11-13 are off), 2 institute closure days (10-27, 10-28) -> 24 recorded days for يزن:
 *   October (8): 10-20 21 22 24 25 26 29 31            PRESENT
 *   November (16): 11-01 02 03 04 05 07 08 09 10 11   PRESENT (10)
 *                  11-12 14 15                         LATE (3)
 *                  11-16 17                            ABSENT (2, by the job)
 *                  11-18                               EXCUSED (1)
 * Golden: rate = (18 + 3) / 24 = 87.5 ; November: 10 / 3 / 2 / 1
 * Dashboard day (another institute, 10 active students): 6 PRESENT, 1 LATE, 1 EXCUSED, 2 none
 *   -> rate = (6 + 1) / 10 = 70.0 ; the section row "attended today" = 7
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { AttendanceProcessor } from '../../../src/modules/attendance/jobs/attendance.processor';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

const PRESENT = ['10-20', '10-21', '10-22', '10-24', '10-25', '10-26', '10-29', '10-31',
  '11-01', '11-02', '11-03', '11-04', '11-05', '11-07', '11-08', '11-09', '11-10', '11-11'];
const LATE = ['11-12', '11-14', '11-15'];
const ABSENT = ['11-16', '11-17'];

describe('[T3] 5.6 attendance numbers', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let yazan: number;
  let familyPhone: string;

  beforeAll(async () => {
    setClock('2026-10-19 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'أرقام الحضور');
    const section = await inst.section({ name: 'التاسع - أ', academicBranchId: await inst.anyAcademicBranch() });
    familyPhone = uniquePhone();
    yazan = (await inst.student({ fullName: 'يزن الخطيب', sectionId: section, newFamily: { familyName: 'الخطيب', fatherName: 'محمد', phone: familyPhone } })).id;
    await inst.admin.post('/closures', { scope: 'INSTITUTE', fromDate: '2026-10-27', toDate: '2026-10-28', reason: 'عطلة' });

    for (const d of PRESENT) {
      setClock(`2026-${d} 07:55`);
      await inst.admin.post('/attendance/check-in', { studentId: yazan });
    }
    for (const d of LATE) {
      setClock(`2026-${d} 08:30`);
      await inst.admin.post('/attendance/check-in', { studentId: yazan });
    }
    for (const d of ABSENT) {
      setClock(`2026-${d} 14:00`);
      await s.runJob(AttendanceProcessor, 'mark-absences', inst.id);
    }
    setClock('2026-11-18 10:00');
    await inst.admin.post('/attendance/excuse', { studentId: yazan, date: '2026-11-18', note: 'مرض' });
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[ATT-40] the database holds exactly 24 days: 18 PRESENT, 3 LATE, 2 ABSENT, 1 EXCUSED', async () => {
    const rows = await s.prisma.dailyAttendance.groupBy({ by: ['status'], where: { studentId: yazan }, _count: true });
    expect(Object.fromEntries(rows.map((r) => [r.status, r._count]))).toEqual({ PRESENT: 18, LATE: 3, ABSENT: 2, EXCUSED: 1 });
  });

  it('[ATT-40] parents app, last 30 days: rate 87.5 with 18 / 3 / 2 / 1', async () => {
    const family = await signIn(s, familyPhone);
    const o = await family.get(`/mobile/students/${yazan}/overview`);
    expect(o.attendance30d).toMatchObject({ present: 18, late: 3, absent: 2, excused: 1, ratePercent: 87.5 });
  });

  it('[ATT-41] parents app, November day by day: 16 days in order, 10 / 3 / 2 / 1', async () => {
    const family = await signIn(s, familyPhone);
    const m = await family.get(`/mobile/students/${yazan}/attendance?month=2026-11`);
    const days: { date: string; status: string }[] = m.days.filter((d: { status: string | null }) => d.status);
    const dates = days.map((d) => d.date);
    expect(dates).toEqual(dates.toSorted());
    const count = (st: string) => days.filter((d) => d.status === st).length;
    expect([days.length, count('PRESENT'), count('LATE'), count('ABSENT'), count('EXCUSED')]).toEqual([16, 10, 3, 2, 1]);
    expect(days.find((d) => d.date === '2026-11-18')!.status).toBe('EXCUSED');
  });

  it('[ATT-43/44] dashboard today: 6 present, 1 late, 1 excused, 2 not recorded -> 70.0; a holiday -> null', async () => {
    setClock('2026-11-18 07:00');
    const other = await InstituteFixture.create(s, 'لوحة الحضور');
    const section = await other.section({ name: 'التاسع - ب', academicBranchId: await other.anyAcademicBranch() });
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) ids.push((await other.student({ fullName: `طالب ${i}`, sectionId: section, newFamily: { familyName: `ل${i}` } })).id);
    setClock('2026-11-18 07:55');
    for (const id of ids.slice(0, 6)) await other.admin.post('/attendance/check-in', { studentId: id });
    setClock('2026-11-18 08:30');
    await other.admin.post('/attendance/check-in', { studentId: ids[6] });
    await other.admin.post('/attendance/excuse', { studentId: ids[7], note: 'سفر' });

    setClock('2026-11-18 11:00');
    const o = await other.admin.get('/dashboard/overview');
    expect(o.attendance.today).toMatchObject({ present: 6, late: 1, excused: 1, notRecorded: 2, rate: 70 });
    const row = o.sections.find((x: { name?: string; sectionName?: string }) => (x.name ?? x.sectionName) === 'التاسع - ب');
    expect([row.activeStudents ?? row.students, row.attendedToday ?? row.presentToday]).toEqual([10, 7]);

    setClock('2026-11-20 11:00'); // Friday
    const friday = await other.admin.get('/dashboard/overview');
    expect([friday.isWorkingDay, friday.attendance.today.rate]).toEqual([false, null]);
  });
});
