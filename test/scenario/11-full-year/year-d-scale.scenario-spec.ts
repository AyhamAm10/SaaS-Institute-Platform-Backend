/**
 * [T8] YEAR-D: a large institute (limits). Plan: 11-full-year-scenarios.md
 * 2,000 students in 60 sections (33 or 34 each), 10 mathematics teachers (6 sections each, 5 periods a week).
 * Contracts 3 x 100,000 from 2026-09-01; every student pays one installment in September, October and
 * November -> 6,000 payments (more than the 5,000-row report limit).
 * Attendance on Wednesday 2026-11-18: every 10th student (200) is not checked in -> the job writes exactly 200 ABSENT.
 * Timings are written to the scenario log for monitoring; the limits asserted are generous on purpose.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { appendFileSync } from 'node:fs';
import { AttendanceProcessor } from '../../../src/modules/attendance/jobs/attendance.processor';
import { NotificationsProcessor } from '../../../src/modules/notifications/notifications.processor';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture } from '../support/builders';
import { uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

const STUDENTS = 2000;
const SECTIONS = 60;
const TEACHERS = 10;

/** Runs `fn` over the items with at most `width` requests in flight (1 here: parallel supertest sockets reset on Windows). */
async function pool<T, R>(items: T[], width: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// A whole year (or 2,000 students) per file: far beyond the default 2 minutes per test
jest.setTimeout(1_800_000);

describe('[T8] YEAR-D scale', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  const sections: number[] = [];
  const st: number[] = [];
  const contracts: number[] = [];
  const timings: string[] = [];

  const timed = async <T>(label: string, fn: () => Promise<T>): Promise<[T, number]> => {
    const started = performance.now();
    const value = await fn();
    const ms = Math.round(performance.now() - started);
    timings.push(`${label}: ${ms} ms`);
    return [value, ms];
  };

  beforeAll(async () => {
    setClock('2026-09-01 08:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الكبير');
    const ab = await inst.anyAcademicBranch();
    const math = await inst.subject('الرياضيات');
    const teachers: number[] = [];
    for (let k = 0; k < TEACHERS; k++) {
      const row = await inst.admin.post('/teachers', { fullName: `أستاذ ${k}`, phone: uniquePhone(), branchIds: [inst.branchId], qualifications: [{ academicBranchId: ab, subjectId: math }] });
      teachers.push(row.id ?? row.teacher?.id);
    }
    for (let k = 0; k < SECTIONS; k++) {
      const id = await inst.section({ name: `شعبة ${k}`, academicBranchId: ab, fee: 300_000 });
      sections.push(id);
      await inst.admin.post(`/sections/${id}/subjects`, { subjectId: math, weeklyPeriods: 5, teacherId: teachers[k % TEACHERS] });
    }
    await timed('create 2,000 students', () => pool(Array.from({ length: STUDENTS }, (_, i) => i), 1, async (i) => {
      st[i] = (await inst.student({ fullName: `طالب ${i}`, sectionId: sections[i % SECTIONS], newFamily: { familyName: `عائلة ${i}` } })).id;
    }));
    await timed('create 2,000 contracts', () => pool(st, 1, async (id, i) => {
      contracts[i] = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(id)}/contract`, { numberOfInstallments: 3, startDate: '2026-09-01' })).id;
    }));
    for (const month of ['09', '10', '11']) {
      setClock(`2026-${month}-05 09:00`);
      await timed(`2,000 payments ${month}`, () => pool(contracts, 1, (c) => inst.admin.post(`/contracts/${c}/payments`, { amount: 100_000 })));
    }
  }, 1_800_000);

  afterAll(async () => {
    realClock();
    if (process.env.SCENARIO_TIMINGS) appendFileSync(process.env.SCENARIO_TIMINGS, `YEAR-D\n${timings.join('\n')}\n`);
    await s?.close();
  });

  it('[YEAR-D 1] the timetable of 60 sections is generated in time, with no clash', async () => {
    setClock('2026-11-01 08:00');
    const [, ms] = await timed('generate 60 sections', () => inst.admin.post(`/academic-years/${inst.yearId}/timetable/generate`, {}));
    expect(ms).toBeLessThan(60_000);
    expect(await s.prisma.timetableEntry.count({ where: { instituteId: inst.id } })).toBe(SECTIONS * 5);
    for (const col of ['teacher_id', 'timetable_id']) {
      const clashes: { n: bigint }[] = await s.prisma.$queryRawUnsafe(
        `select count(*) as n from (select ${col}, day_of_week, start_time from timetable_entries where institute_id = $1 group by 1, 2, 3 having count(*) > 1) x`, inst.id);
      expect([col, Number(clashes[0].n)]).toEqual([col, 0]);
    }
  });

  it('[YEAR-D 2] the absence job writes exactly the 200 missing students, and again nothing more', async () => {
    setClock('2026-11-18 07:55');
    await timed('bulk check-in 60 sections', () => pool(sections, 1, (sectionId) => {
      const ids = st.filter((_, i) => i % SECTIONS === sections.indexOf(sectionId) && i % 10 !== 0);
      return inst.admin.post('/attendance/bulk', { sectionId, action: 'check-in', studentIds: ids });
    }));
    setClock('2026-11-18 14:00');
    await timed('mark-absences 2,000 students', () => s.runJob(AttendanceProcessor, 'mark-absences', inst.id));
    await s.runJob(AttendanceProcessor, 'mark-absences', inst.id);
    const day = await s.prisma.dailyAttendance.groupBy({ by: ['status'], where: { instituteId: inst.id, date: new Date('2026-11-18') }, _count: true });
    expect(Object.fromEntries(day.map((r) => [r.status, r._count]))).toEqual({ PRESENT: 1800, ABSENT: 200 });
    const absent = await s.prisma.dailyAttendance.findMany({ where: { instituteId: inst.id, status: 'ABSENT' }, select: { studentId: true } });
    expect(absent.map((r) => st.indexOf(r.studentId)).every((i) => i % 10 === 0)).toBe(true);
  });

  it('[YEAR-D 3] lesson reminders: one per teacher with an 08:00 lesson, never twice', async () => {
    const wednesday = await s.prisma.timetableEntry.findMany({ where: { instituteId: inst.id, dayOfWeek: 3, startTime: '08:00' }, select: { teacherId: true } });
    const expected = new Set(wednesday.map((e) => e.teacherId)).size;
    setClock('2026-11-18 07:45');
    await s.runJob(NotificationsProcessor, 'send-lesson-reminders', inst.id);
    setClock('2026-11-18 07:50');
    await s.runJob(NotificationsProcessor, 'send-lesson-reminders', inst.id);
    const sent = await s.prisma.notification.findMany({ where: { instituteId: inst.id, type: 'LESSON_REMINDER' } });
    expect(sent).toHaveLength(expected);
    expect(new Set(sent.map((n) => n.userId)).size).toBe(expected);
  });

  it('[YEAR-D 4] a report of 6,000 payments is refused clearly, never cut to 5,000 with wrong totals', async () => {
    setClock('2026-11-18 15:00');
    const res = await inst.admin.call('get', '/reports/payments-register?from=2026-09-01&to=2026-11-18', undefined, { status: 999 }).catch((e: Error) => e.message);
    const status = Number(/-> (\d{3})/.exec(String(res))?.[1]);
    expect(status).toBe(400);
    expect(String(res)).toMatch(/5000|5,000|period|الفترة/i);
    // one month (2,000 rows) works and its totals are exact
    const nov = await inst.admin.get('/reports/payments-register?from=2026-11-01&to=2026-11-18');
    const table = nov.blocks.find((b: { type: string }) => b.type === 'table');
    expect([table.rows.length, table.totals[0].amount?.amount ?? Object.values(table.totals[0]).map((v) => (v as { amount?: number })?.amount).find(Boolean)]).toEqual([2000, 200_000_000]);
  });

  it('[YEAR-D 5] the busy screens answer in reasonable time (logged for monitoring)', async () => {
    const checks: [string, string][] = [
      ['dashboard', '/dashboard/overview'],
      ['students page', '/students?limit=50'],
      ['daily attendance report', '/reports/daily-attendance?date=2026-11-18'],
      ['students directory report', '/reports/students-directory'],
      ['overdue aging', '/reports/overdue-aging'],
    ];
    for (const [label, path] of checks) {
      const [, ms] = await timed(label, () => inst.admin.get(path));
      expect([label, ms < 15_000]).toEqual([label, true]);
    }
  });
});
