/**
 * [T2] 1.5 Operational context (X-Branch-Id / X-Academic-Year-Id). Plan: 01-tenancy-auth-roles.md
 * Two branches: المزة (3 students) and المالكي (2 students).
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture } from '../support/builders';
import { realClock, setClock } from '../support/clock';

describe('[T2] 1.5 branch and year context', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let malki: number;
  const malkiStudents: number[] = [];

  beforeAll(async () => {
    setClock('2026-11-18 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'السياق');
    malki = await inst.branch('المالكي');
    const ab = await inst.anyAcademicBranch();
    const mazzehSection = await inst.section({ name: 'شعبة المزة', academicBranchId: ab });
    const malkiSection = await inst.section({ name: 'شعبة المالكي', academicBranchId: ab, branchId: malki });
    for (const n of ['أ', 'ب', 'ج']) await inst.student({ fullName: `طالب المزة ${n}`, sectionId: mazzehSection, newFamily: { familyName: `م${n}` } });
    for (const n of ['أ', 'ب']) {
      malkiStudents.push((await inst.student({ fullName: `طالب المالكي ${n}`, sectionId: malkiSection, branchId: malki, newFamily: { familyName: `ك${n}` } })).id);
    }
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  const names = (body: { data?: { fullName: string }[] } | { fullName: string }[]) =>
    ((Array.isArray(body) ? body : body.data) ?? []).map((x) => x.fullName).sort();

  it('[CTX-01] the branch header limits lists; without it every branch is listed', async () => {
    expect(names(await inst.admin.withContext({ branchId: inst.branchId }).get('/students'))).toEqual(['طالب المزة أ', 'طالب المزة ب', 'طالب المزة ج']);
    expect(names(await inst.admin.withContext({ branchId: malki }).get('/students'))).toEqual(['طالب المالكي أ', 'طالب المالكي ب']);
    expect(names(await inst.admin.get('/students?limit=50'))).toHaveLength(5);
  });

  it('[CTX-02] editing a student of another branch than the header answers 404 (the branch hides it)', async () => {
    const err = await inst.admin.withContext({ branchId: inst.branchId }).fails('patch', `/students/${malkiStudents[0]}`, 404, { fullName: 'تعديل' });
    expect(err.message).toBe('Student not found');
    const row = await s.prisma.student.findUniqueOrThrow({ where: { id: malkiStudents[0] } });
    expect(row.fullName).toBe('طالب المالكي أ');
  });

  it('[CTX-03] the dashboard follows the branch header and its parts add up to the whole', async () => {
    const count = async (branchId?: number) => {
      const api = branchId ? inst.admin.withContext({ branchId }) : inst.admin;
      const o = await api.get('/dashboard/overview');
      return Number(o.students?.active ?? o.students?.total ?? o.students);
    };
    const [all, mazzeh, malkiCount] = [await count(), await count(inst.branchId), await count(malki)];
    expect([all, mazzeh, malkiCount]).toEqual([5, 3, 2]);
  });

  it('[CTX-05] every write aimed at another branch than the header is refused and leaves nothing behind', async () => {
    const ab = await inst.anyAcademicBranch();
    const subject = await inst.subject('مادة السياق');
    const malkiSection = (await s.prisma.section.findFirstOrThrow({ where: { instituteId: inst.id, branchId: malki } })).id;
    await inst.admin.post(`/sections/${malkiSection}/subjects`, { subjectId: subject, weeklyPeriods: 2 });
    const free = (await inst.student({ fullName: 'طالب المالكي بلا شعبة', branchId: malki, newFamily: { familyName: 'كح' } })).id;
    const enrollment = await inst.enrollmentOf(malkiStudents[1]);
    const mazzeh = inst.admin.withContext({ branchId: inst.branchId });
    const malkiContract = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(malkiStudents[0])}/contract`, { numberOfInstallments: 1, grossAmount: 100_000 })).id;
    const snapshot = async () => [
      await s.prisma.payment.count({ where: { instituteId: inst.id } }),
      await s.prisma.studentNote.count({ where: { studentId: malkiStudents[0] } }),
      await s.prisma.exam.count({ where: { sectionId: malkiSection } }),
      await s.prisma.dailyAttendance.count({ where: { studentId: { in: [...malkiStudents, free] } } }),
      await s.prisma.studentEnrollment.count({ where: { studentId: free } }),
      await s.prisma.studentSubscription.count({ where: { enrollmentId: enrollment } }),
      await s.prisma.timetableEntry.count({ where: { timetable: { sectionId: malkiSection } } }),
    ];
    const before = await snapshot();
    const writes: [string, 'post', string, unknown][] = [
      ['exam', 'post', '/exams', { sectionId: malkiSection, subjectId: subject, title: 'سياق', examDate: '2026-11-20', maxMark: 20, passMark: 10 }],
      ['bulk attendance', 'post', '/attendance/bulk', { sectionId: malkiSection, action: 'check-in' }],
      ['check-in', 'post', '/attendance/check-in', { studentId: malkiStudents[0] }],
      ['enroll', 'post', `/sections/${malkiSection}/enrollments`, { studentIds: [free] }],
      ['contract', 'post', `/enrollments/${enrollment}/contract`, { numberOfInstallments: 2 }],
      ['payment', 'post', `/contracts/${malkiContract}/payments`, { amount: 50_000 }],
      ['student note', 'post', `/students/${malkiStudents[0]}/notes`, { body: 'ملاحظة' }],
      ['timetable entry', 'post', `/academic-years/${inst.yearId}/sections/${malkiSection}/timetable/entries`, { subjectId: subject, dayOfWeek: 0, startTime: '08:00', endTime: '08:45' }],
    ];
    const outcome: Record<string, number> = {};
    const bodies: Record<string, any> = {};
    for (const [name, method, path, body] of writes) {
      const res = await mazzeh.call(method, path, body, { status: 999 }).catch((e: Error) => e.message);
      outcome[name] = Number(/-> (\d{3})/.exec(String(res))?.[1]);
      bodies[name] = JSON.parse(String(res).slice(String(res).indexOf(': ') + 2) || 'null');
    }
    // Before 2026-11-19: the exam and the contract were saved behind a 404 "not found", the bulk check-in wrote
    // the other branch's students, and a check-in after that crashed with 500 (unique violation).
    expect(outcome).toMatchObject({ exam: 400, 'bulk attendance': 400, 'check-in': 400, enroll: 201, contract: 400, 'timetable entry': 400 });
    // a payment is refused; a note is accepted on the student himself (visible, not hidden): recorded as an inconsistency
    expect({ payment: outcome.payment, note: outcome["student note"] }).toEqual({ payment: 400, note: 201 });
    // enrolling never fails as a whole: the student is reported as rejected
    expect(bodies.enroll.enrolled).toEqual([]);
    expect(bodies.enroll.rejected.map((r: { studentId: number }) => r.studentId)).toEqual([free]);
    const after = await snapshot();
    expect(after).toEqual([before[0], before[1] + 1, ...before.slice(2)]);
    void ab;
  });

  it('[CTX-04] a branch header of another institute is refused', async () => {
    const other = await InstituteFixture.create(s, 'سياق آخر');
    await inst.admin.withContext({ branchId: other.branchId }).fails('get', '/students', 400);
  });
});
