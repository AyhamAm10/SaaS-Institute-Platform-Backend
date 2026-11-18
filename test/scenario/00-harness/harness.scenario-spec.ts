/**
 * [T0] Proves the scenario harness itself on the REAL test database: a fresh
 * institute through the API, data visible in the database, the fake clock driving
 * business rules, tenant isolation, background jobs and the fake push sender.
 * Plan: docs/private/test-plan/00-strategy.md
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { AttendanceProcessor } from '../../../src/modules/attendance/jobs/attendance.processor';
import { NotificationsProcessor } from '../../../src/modules/notifications/notifications.processor';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { eventually } from '../support/client';
import { realClock, setClock } from '../support/clock';

describe('[T0] scenario harness', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let other: InstituteFixture;
  let sectionId: number;
  const students: Record<string, { id: number; familyId: number }> = {};
  const familyPhone = '0944' + String(process.pid % 1_000_000).padStart(6, '0');

  beforeAll(async () => {
    setClock('2026-11-18 07:30'); // Wednesday, a working day
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الاختبار');
    other = await InstituteFixture.create(s, 'المنافس');
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[HARNESS-01] a new institute gets its admin and the 3 default academic branches', async () => {
    const rows = await s.prisma.academicBranch.findMany({ where: { instituteId: inst.id }, orderBy: { id: 'asc' } });
    expect(rows.map((r) => r.name)).toEqual([
      'الصف التاسع',
      'الثانوي العام — الفرع العلمي',
      'الثانوي العام — الفرع الأدبي',
    ]);
    const admins = await s.prisma.user.count({ where: { instituteId: inst.id, role: 'INSTITUTE_ADMIN' } });
    expect(admins).toBe(1);
  });

  it('[HARNESS-02] registering students with a new family writes the enrollment and the guardian account', async () => {
    const ab = (await s.prisma.academicBranch.findFirstOrThrow({ where: { instituteId: inst.id, name: 'الصف التاسع' } })).id;
    sectionId = await inst.section({ name: 'التاسع - أ', academicBranchId: ab, fee: 1_500_000 });
    students.yazan = await inst.student({
      fullName: 'يزن الخطيب',
      sectionId,
      newFamily: { familyName: 'الخطيب', fatherName: 'محمد الخطيب', phone: familyPhone },
    });
    students.salma = await inst.student({ fullName: 'سلمى الخطيب', gender: 'FEMALE', sectionId, familyId: students.yazan.familyId });
    students.omar = await inst.student({ fullName: 'عمر العمر', sectionId, newFamily: { familyName: 'العمر' } });

    const enrollments = await s.prisma.studentEnrollment.findMany({ where: { sectionId, status: 'ACTIVE' } });
    expect(enrollments).toHaveLength(3);
    const guardian = await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, phone: familyPhone } });
    expect(guardian).toMatchObject({ role: 'FAMILY', fullName: 'محمد الخطيب', mustChangePassword: true });
  });

  it('[HARNESS-03] the fake clock drives the late rule: 08:15 is PRESENT, 08:16 is LATE', async () => {
    setClock('2026-11-18 08:15');
    const a = await inst.admin.post('/attendance/check-in', { studentId: students.yazan.id });
    setClock('2026-11-18 08:16');
    const b = await inst.admin.post('/attendance/check-in', { studentId: students.salma.id });
    expect(a.status).toBe('PRESENT');
    expect(b.status).toBe('LATE');
    const rows = await s.prisma.dailyAttendance.findMany({ where: { studentId: { in: [students.yazan.id, students.salma.id] } } });
    expect(rows.map((r) => r.date.toISOString().slice(0, 10))).toEqual(['2026-11-18', '2026-11-18']);
  });

  it('[HARNESS-04] another institute cannot see these students (404, not 403)', async () => {
    await other.admin.fails('get', `/students/${students.yazan.id}`, 404);
  });

  it('[HARNESS-05] a background job runs for real: after 14:00 the student without check-in is ABSENT', async () => {
    setClock('2026-11-18 13:59');
    await s.runJob(AttendanceProcessor, 'mark-absences', inst.id);
    expect(await s.prisma.dailyAttendance.count({ where: { studentId: students.omar.id } })).toBe(0);

    setClock('2026-11-18 14:00');
    await s.runJob(AttendanceProcessor, 'mark-absences', inst.id);
    await s.runJob(AttendanceProcessor, 'mark-absences', inst.id); // idempotent
    const omar = await s.prisma.dailyAttendance.findMany({ where: { studentId: students.omar.id } });
    expect(omar).toHaveLength(1);
    expect(omar[0].status).toBe('ABSENT');
  });

  it('[HARNESS-06] notifications reach the inbox and the fake push sender', async () => {
    const family = await signIn(s, familyPhone);
    await family.post('/notifications/devices', { token: 'web-token-harness-0001', platform: 'WEB', app: 'PARENTS' });

    // Events are written after the response: wait until both notices are in
    const inbox = await eventually(() => family.get('/notifications?page=1&limit=20'), (b) => b.total >= 2);
    const titles = inbox.data.map((n: { title: string }) => n.title);
    expect(titles).toEqual(expect.arrayContaining(['وصل يزن الخطيب إلى المعهد', 'سلمى الخطيب متأخرة اليوم']));

    const ids = inbox.data.map((n: { id: number }) => n.id);
    await s.runJob(NotificationsProcessor, 'send-push', inst.id, { notificationIds: ids });
    expect(s.push.sent.map((p) => p.message.title)).toEqual(expect.arrayContaining(['وصل يزن الخطيب إلى المعهد']));
    expect(s.push.sent[0].target.webLink).toMatch(/\/parents\/attendance\?studentId=\d+$/);
  });
});
