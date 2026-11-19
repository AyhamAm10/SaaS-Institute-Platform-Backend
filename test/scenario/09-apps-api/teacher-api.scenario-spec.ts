/**
 * [T7] 9.3 the teacher app API. Plan: 09-mobile-teacher-api.md
 * رامي teaches mathematics in التاسع - أ (main branch) and in العاشر (branch المالكي).
 * هبة teaches physics in التاسع - أ. التاسع - ج has no lesson of رامي.
 * التاسع - أ: يزن (mathematics only), عمر (everything), وليد (withdrawn) -> 2 active students.
 * Today: Tuesday 2026-11-10, 09:50. رامي's Tuesday: 11:30 العاشر, 08:00 التاسع - أ (created in that order).
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

describe('[T7] 9.3 teacher api', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let rami: Api;
  let hiba: Api;
  let malki: number;
  const sec: Record<string, number> = {};
  const subj: Record<string, number> = {};
  const t: Record<string, number> = {};
  const st: Record<string, number> = {};
  const phones: Record<string, string> = {};

  beforeAll(async () => {
    setClock('2026-11-10 07:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'تطبيق الأساتذة');
    const ab = await inst.anyAcademicBranch();
    malki = await inst.branch('المالكي');
    subj.math = await inst.subject('الرياضيات');
    subj.phys = await inst.subject('الفيزياء');
    const teacher = async (key: string, name: string, subject: number, branchIds: number[]) => {
      phones[key] = uniquePhone();
      const row = await inst.admin.post('/teachers', { fullName: name, phone: phones[key], branchIds, qualifications: [{ academicBranchId: ab, subjectId: subject }] });
      t[key] = row.id ?? row.teacher?.id;
    };
    await teacher('rami', 'أ. رامي الحلبي', subj.math, [inst.branchId, malki]);
    await teacher('hiba', 'أ. هبة', subj.phys, [inst.branchId]);
    sec.a = await inst.section({ name: 'التاسع - أ', academicBranchId: ab });
    sec.c = await inst.section({ name: 'التاسع - ج', academicBranchId: ab });
    sec.m = await inst.section({ name: 'العاشر', academicBranchId: ab, branchId: malki });
    await inst.admin.post(`/sections/${sec.a}/subjects`, { subjectId: subj.math, weeklyPeriods: 5, teacherId: t.rami });
    await inst.admin.post(`/sections/${sec.a}/subjects`, { subjectId: subj.phys, weeklyPeriods: 3, teacherId: t.hiba });
    await inst.admin.post(`/sections/${sec.c}/subjects`, { subjectId: subj.phys, weeklyPeriods: 3, teacherId: t.hiba });
    await inst.admin.post(`/sections/${sec.m}/subjects`, { subjectId: subj.math, weeklyPeriods: 5, teacherId: t.rami });

    phones.yazanFamily = uniquePhone();
    st.yazan = (await inst.student({ fullName: 'يزن الخطيب', sectionId: sec.a, newFamily: { familyName: 'الخطيب', fatherName: 'محمد', phone: phones.yazanFamily } })).id;
    st.omar = (await inst.student({ fullName: 'عمر العمر', sectionId: sec.a, newFamily: { familyName: 'العمر', fatherName: 'أحمد', phone: uniquePhone() } })).id;
    st.walid = (await inst.student({ fullName: 'وليد', sectionId: sec.a, newFamily: { familyName: 'الوليد' } })).id;
    await inst.admin.put(`/enrollments/${await inst.enrollmentOf(st.yazan)}/subjects`, { subjectIds: [subj.math] });
    await inst.admin.patch(`/enrollments/${await inst.enrollmentOf(st.walid)}/status`, { status: 'WITHDRAWN', reason: 'سفر' });

    await inst.admin.post(`/academic-years/${inst.yearId}/sections/${sec.m}/timetable/entries`, { subjectId: subj.math, teacherId: t.rami, dayOfWeek: 2, startTime: '11:30', endTime: '12:15' });
    await inst.admin.post(`/academic-years/${inst.yearId}/sections/${sec.a}/timetable/entries`, { subjectId: subj.math, teacherId: t.rami, dayOfWeek: 2, startTime: '08:00', endTime: '08:45' });

    setClock('2026-11-10 09:50');
    rami = await signIn(s, phones.rami);
    hiba = await signIn(s, phones.hiba);
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[TAP-01] /teacher/me without a year header: the current year and exactly the institute schedule', async () => {
    const me = await rami.get('/teacher/me');
    const cfg = await inst.admin.get('/schedule-config');
    expect(me.academicYear.id).toBe(inst.yearId);
    expect(me.institute.timezone).toBe('Asia/Damascus');
    expect(me.schedule).toEqual({
      workingDays: cfg.workingDays, dayStartTime: cfg.dayStartTime, dayEndTime: cfg.dayEndTime,
      periodDurationMinutes: cfg.periodDurationMinutes, lateAfterMinutes: cfg.lateAfterMinutes,
      breaks: cfg.breaks.map((b: { name: string; startTime: string; endTime: string }) => ({ name: b.name, startTime: b.startTime, endTime: b.endTime })),
    });
    expect(me.branches.map((b: { id: number }) => b.id).sort()).toEqual([inst.branchId, malki].sort());
  });

  it('[TAP-02] overview at 09:50: now "09:50", Tuesday, working day, both lessons in time order across branches', async () => {
    const o = await rami.get('/teacher/overview');
    expect([o.date, o.now, o.dayOfWeek, o.isWorkingDay]).toEqual(['2026-11-10', '09:50', 2, true]);
    expect(o.lessons.map((l: { startTime: string; sectionName: string }) => [l.startTime, l.sectionName])).toEqual([['08:00', 'التاسع - أ'], ['11:30', 'العاشر']]);
  });

  it('[TAP-03] his sections only, with the number of ACTIVE students (the withdrawn one is not counted)', async () => {
    const list = await rami.get('/teacher/sections');
    const rows = list.map((x: { name: string; studentCount: number; branchId: number; academicYearId: number }) => [x.name, x.studentCount, x.branchId, x.academicYearId]);
    expect(rows.sort()).toEqual([['التاسع - أ', 2, inst.branchId, inst.yearId], ['العاشر', 0, malki, inst.yearId]].sort());
  });

  it('[TAP-04] roster: with subjectId only the students who study it; the guardian phone and nothing else of the family', async () => {
    const all = await hiba.get(`/teacher/sections/${sec.a}/students`);
    expect(all.students.map((x: { fullName: string }) => x.fullName).sort()).toEqual(['عمر العمر', 'يزن الخطيب'].sort());
    const phys = await hiba.get(`/teacher/sections/${sec.a}/students?subjectId=${subj.phys}`);
    expect(phys.students.map((x: { fullName: string }) => x.fullName)).toEqual(['عمر العمر']);
    const math = await rami.get(`/teacher/sections/${sec.a}/students?subjectId=${subj.math}`);
    const yazan = math.students.find((x: { id: number }) => x.id === st.yazan);
    expect(Object.keys(yazan).sort()).toEqual(['familyName', 'fullName', 'gender', 'guardianPhone', 'id']);
    expect([yazan.familyName, yazan.guardianPhone]).toEqual(['الخطيب', phones.yazanFamily]);
  });

  it('[TAP-05] a section he does not teach is 404; a subject he does not teach in his own section is 403', async () => {
    await rami.fails('get', `/teacher/sections/${sec.c}/students`, 404);
    await rami.fails('get', `/teacher/sections/${sec.a}/students?subjectId=${subj.phys}`, 403);
  });

  it('[TAP-07] writing in his other branch works with that section\'s own branch and year headers', async () => {
    const ctx = rami.withContext({ branchId: malki, academicYearId: inst.yearId });
    const exam = await ctx.post('/exams', { sectionId: sec.m, subjectId: subj.math, title: 'مذاكرة المالكي', examDate: '2026-11-15', maxMark: 20, passMark: 10 });
    expect(exam.id).toBeGreaterThan(0);
    // the same call with the main branch header is refused (the section is not in that branch)
    const wrong = rami.withContext({ branchId: inst.branchId, academicYearId: inst.yearId });
    const err = await wrong.fails('post', '/exams', 400, { sectionId: sec.m, subjectId: subj.math, title: 'خطأ', examDate: '2026-11-16', maxMark: 20, passMark: 10 });
    expect(err.message).toMatch(/branch/i);
    // nothing was saved behind the refusal (before the fix the exam was stored and the answer was "Exam not found")
    expect(await s.prisma.exam.count({ where: { sectionId: sec.m, title: 'خطأ' } })).toBe(0);
    // and it appears in his upcoming exams (next 14 days)
    const o = await rami.get('/teacher/overview');
    expect(o.upcomingExams.map((e: { title: string }) => e.title)).toEqual(['مذاكرة المالكي']);
  });

  it('[TAP-06] a deactivated teacher is refused at once (401); another role on /teacher is 403', async () => {
    await inst.admin.fails('get', '/teacher/me', 403);
    const userId = (await s.prisma.teacher.findUniqueOrThrow({ where: { id: t.hiba } })).userId;
    await inst.admin.patch(`/accounts/${userId}/active`, { isActive: false });
    await hiba.fails('get', '/teacher/overview', 401);
  });
});
