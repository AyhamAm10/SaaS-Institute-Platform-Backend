/**
 * [T6] 2.1-2.4 institute setup, years, sections and their plan, teachers. Plan: 02-academic-setup.md
 * Default schedule: Saturday-Thursday, 08:00-14:00, 45-minute periods, break 10:15-10:45, late after 15 min.
 * Golden slots: 08:00-08:45, 08:45-09:30, 09:30-10:15, [break 10:15-10:45], 10:45-11:30, 11:30-12:15,
 *               12:15-13:00, 13:00-13:45 (the last 15 minutes are shorter than a period and are dropped).
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

describe('[T6] 2.x academic setup', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let malki: number;
  let ab9: number;
  let abSci: number;
  const subj: Record<string, number> = {};

  beforeAll(async () => {
    setClock('2026-09-01 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'التهيئة');
    malki = await inst.branch('المالكي');
    const rows = await s.prisma.academicBranch.findMany({ where: { instituteId: inst.id }, orderBy: { id: 'asc' } });
    [ab9, abSci] = [rows[0].id, rows[1].id];
    subj.math = await inst.subject('الرياضيات');
    subj.en = await inst.subject('اللغة الإنكليزية');
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[ACAD-02] an academic branch with an existing name (even with extra spaces) is refused', async () => {
    const err = await inst.admin.fails('post', '/academic-branches', 409, { name: '  الصف التاسع ' });
    expect(err.message).toMatch(/exist|duplicate/i);
  });

  it('[ACAD-03] the schedule is created with the defaults on first read', async () => {
    const cfg = await inst.admin.get('/schedule-config');
    expect(cfg).toMatchObject({
      workingDays: [6, 0, 1, 2, 3, 4], dayStartTime: '08:00', dayEndTime: '14:00', periodDurationMinutes: 45, lateAfterMinutes: 15,
    });
    expect(cfg.breaks.map((b: { startTime: string; endTime: string }) => [b.startTime, b.endTime])).toEqual([['10:15', '10:45']]);
  });

  it('[ACAD-04] the default day has exactly 7 lesson periods and one break', async () => {
    const slots: { type: string; startTime: string; endTime: string }[] = await inst.admin.get('/schedule-config/slots');
    expect(slots.map((x) => `${x.type === 'BREAK' ? 'B' : 'L'} ${x.startTime}-${x.endTime}`)).toEqual([
      'L 08:00-08:45', 'L 08:45-09:30', 'L 09:30-10:15', 'B 10:15-10:45',
      'L 10:45-11:30', 'L 11:30-12:15', 'L 12:15-13:00', 'L 13:00-13:45',
    ]);
  });

  it('[ACAD-05] impossible schedules are refused', async () => {
    const base = { workingDays: [6, 0, 1, 2, 3, 4], dayStartTime: '08:00', dayEndTime: '14:00', periodDurationMinutes: 45, lateAfterMinutes: 15 };
    await inst.admin.fails('patch', '/schedule-config', 400, { ...base, dayStartTime: '14:00', dayEndTime: '08:00', breaks: [] });
    await inst.admin.fails('patch', '/schedule-config', 400, { ...base, breaks: [{ name: 'خارج', startTime: '15:00', endTime: '15:30' }] });
    await inst.admin.fails('patch', '/schedule-config', 400, {
      ...base, breaks: [{ name: 'أ', startTime: '10:00', endTime: '10:30' }, { name: 'ب', startTime: '10:15', endTime: '10:45' }],
    });
    await inst.admin.fails('patch', '/schedule-config', 400, { ...base, dayStartTime: '08:00', dayEndTime: '08:30', breaks: [] });
    expect((await inst.admin.get('/schedule-config')).dayEndTime).toBe('14:00');
  });

  it('[YEAR-01/02] only one current year at a time; an end before the start is refused', async () => {
    const next = await inst.admin.post('/academic-years', { name: '2027-2028', startDate: '2027-09-01', endDate: '2028-06-30', isCurrent: true });
    const current = await s.prisma.academicYear.findMany({ where: { instituteId: inst.id, isCurrent: true } });
    expect(current.map((y) => y.id)).toEqual([next.id]);
    await inst.admin.patch(`/academic-years/${inst.yearId}/set-current`);
    expect((await s.prisma.academicYear.findMany({ where: { instituteId: inst.id, isCurrent: true } })).map((y) => y.id)).toEqual([inst.yearId]);
    await inst.admin.fails('post', '/academic-years', 400, { name: 'خطأ', startDate: '2028-09-01', endDate: '2028-01-01' });
  });

  it('[SEC-01/02] a section takes the academic branch name as grade; names are unique per branch and year only', async () => {
    const id = await inst.section({ name: 'التاسع - أ', academicBranchId: ab9 });
    const row = await s.prisma.section.findUniqueOrThrow({ where: { id } });
    expect([row.grade, Number(row.feeAmount), row.feeCurrency]).toEqual(['الصف التاسع', 0, 'SYP']);
    await inst.admin.fails('post', '/sections', 409, { name: 'التاسع - أ', academicBranchId: ab9, feeAmount: 0, branchId: inst.branchId, academicYearId: inst.yearId });
    await inst.section({ name: 'التاسع - أ', academicBranchId: ab9, branchId: malki }); // same name, other branch: fine
  });

  it('[SEC-03] fees: pounds without fractions, dollars with cents', async () => {
    const id = await inst.section({ name: 'شعبة الرسوم', academicBranchId: ab9 });
    await inst.admin.fails('patch', `/sections/${id}/fee`, 400, { feeAmount: 1_500_000.5, feeCurrency: 'SYP' });
    await inst.admin.patch(`/sections/${id}/fee`, { feeAmount: 1_500_000, feeCurrency: 'SYP' });
    await inst.admin.patch(`/sections/${id}/fee`, { feeAmount: 600.25, feeCurrency: 'USD' });
    // switching only the currency back to pounds would turn 600.25 into fractional pounds: refused (fixed 2026-11-19)
    await inst.admin.fails('patch', `/sections/${id}/fee`, 400, { feeAmount: 600.25, feeCurrency: 'SYP' });
    await inst.admin.fails('patch', `/sections/${id}`, 400, { feeCurrency: 'SYP' });
    await inst.admin.fails('post', '/sections', 400, { name: 'كسور', academicBranchId: ab9, feeAmount: 100.5, branchId: inst.branchId, academicYearId: inst.yearId });
    const row = await s.prisma.section.findUniqueOrThrow({ where: { id } });
    expect([Number(row.feeAmount), row.feeCurrency]).toEqual([600.25, 'USD']);
  });

  it('[SEC-04/05] the plan: one row per subject; at least one period a week (default 1)', async () => {
    const id = await inst.section({ name: 'شعبة الخطة', academicBranchId: ab9 });
    await inst.admin.post(`/sections/${id}/subjects`, { subjectId: subj.math });
    await inst.admin.fails('post', `/sections/${id}/subjects`, 409, { subjectId: subj.math, weeklyPeriods: 2 });
    await inst.admin.fails('post', `/sections/${id}/subjects`, 400, { subjectId: subj.en, weeklyPeriods: 0 });
    const plan = await s.prisma.sectionSubject.findMany({ where: { sectionId: id } });
    expect(plan.map((p) => [p.subjectId, p.weeklyPeriods])).toEqual([[subj.math, 1]]);
  });

  it('[SEC-06/07/08] a teacher must work in the branch AND be qualified for this academic branch (the لينا case)', async () => {
    const id = await inst.section({ name: 'شعبة الإسناد', academicBranchId: ab9 });
    const phone = uniquePhone();
    const lina = await inst.admin.post('/teachers', {
      fullName: 'أ. لينا الشامي', phone, branchIds: [malki], qualifications: [{ academicBranchId: abSci, subjectId: subj.en }],
    });
    const linaId = lina.id ?? lina.teacher?.id;
    // not in this branch
    expect((await inst.admin.fails('post', `/sections/${id}/subjects`, 400, { subjectId: subj.en, teacherId: linaId })).message).toMatch(/branch/i);
    await inst.admin.patch(`/teachers/${linaId}`, { branchIds: [inst.branchId, malki] });
    // in the branch, but qualified for another academic branch: refused, plan unchanged
    expect((await inst.admin.fails('post', `/sections/${id}/subjects`, 400, { subjectId: subj.en, teacherId: linaId })).message).toMatch(/qualif/i);
    expect(await s.prisma.sectionSubject.count({ where: { sectionId: id } })).toBe(0);
    // qualified for this academic branch: accepted, and she sees the section in her app
    await inst.admin.post(`/teachers/${linaId}/assignments`, { academicBranchId: ab9, subjectId: subj.en });
    await inst.admin.post(`/sections/${id}/subjects`, { subjectId: subj.en, weeklyPeriods: 3, teacherId: linaId });
    const st = await inst.student({ fullName: 'طالب', sectionId: id, newFamily: { familyName: 'ط' } });
    expect(st.id).toBeGreaterThan(0);
    const her = await signIn(s, phone);
    const sections = await her.get('/teacher/sections');
    expect(sections.map((x: { name: string; studentCount: number }) => [x.name, x.studentCount])).toEqual([['شعبة الإسناد', 1]]);
  });

  it('[TCH-01/02/03] qualifications are unique; availability must be sane; branches are replaced as a whole', async () => {
    const t = await inst.admin.post('/teachers', { fullName: 'أ. محمود', phone: uniquePhone(), branchIds: [inst.branchId], qualifications: [{ academicBranchId: ab9, subjectId: subj.math }] });
    const tid = t.id ?? t.teacher?.id;
    await inst.admin.fails('post', `/teachers/${tid}/assignments`, 409, { academicBranchId: ab9, subjectId: subj.math });
    await inst.admin.fails('post', `/teachers/${tid}/availability`, 400, { availabilities: [{ dayOfWeek: 0, startTime: '09:00', endTime: '08:00' }] });
    await inst.admin.fails('post', `/teachers/${tid}/availability`, 400, {
      availabilities: [{ dayOfWeek: 0, startTime: '08:00', endTime: '10:00' }, { dayOfWeek: 0, startTime: '09:00', endTime: '11:00' }],
    });
    await inst.admin.fails('post', `/teachers/${tid}/availability`, 400, { availabilities: [{ dayOfWeek: 7, startTime: '08:00', endTime: '09:00' }] });
    await inst.admin.patch(`/teachers/${tid}`, { branchIds: [malki] });
    expect((await s.prisma.branchTeacher.findMany({ where: { teacherId: tid } })).map((b) => b.branchId)).toEqual([malki]);
  });

  it('[TCH-04] a teacher reads only his own record', async () => {
    const phone = uniquePhone();
    await inst.admin.post('/teachers', { fullName: 'أ. سامر', phone, branchIds: [inst.branchId] });
    const me = await signIn(s, phone);
    const list = await me.get('/teachers');
    expect((list.data ?? list).map((t: { fullName?: string; user?: { fullName: string } }) => t.fullName ?? t.user?.fullName)).toEqual(['أ. سامر']);
    const colleague = await s.prisma.teacher.findFirstOrThrow({ where: { instituteId: inst.id, user: { fullName: 'أ. محمود' } } });
    await me.fails('get', `/teachers/${colleague.id}`, 404);
  });
});
