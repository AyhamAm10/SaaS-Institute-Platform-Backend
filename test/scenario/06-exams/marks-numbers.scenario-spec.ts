/**
 * [T4] 6.3 percentages everywhere, 6.4 the teacher's views. Plan: 06-exams-marks.md
 * Section التاسع - أ, mathematics (teacher رامي), physics:
 *   exam A math /20: S1 18, S2 16, S3 14, S4 12   -> 90, 80, 70, 60 (exam average 75)
 *   exam B math /50: S1 25, others pending         -> 50 (1 graded)
 * Golden:
 *   S1 mathematics (parents app) = plain mean of his exams = (90 + 50) / 2 = 70.0
 *   section average on the dashboard = weighted by graded count = (75 x 4 + 50 x 1) / 5 = 70.0
 *     (the plain mean of exam averages would be 62.5: the two rules differ on purpose)
 *   after a physics exam /10 with S1 = 8 (80): S1 overall = (90 + 50 + 80) / 3 = 73.3
 * Rounding edge in its own section: 9.75 / 20 = 48.75 % -> 48.8 on every screen.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { num } from '../support/money';

describe('[T4] 6.3-6.4 percentages and the teacher views', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let teacher: Api;
  let section: number;
  let edgeSection: number;
  const subj: Record<string, number> = {};
  const S: number[] = [];
  const phones: Record<string, string> = {};
  let edgeStudent: number;
  let examB: number;

  const subjectOf = (results: { subjects: { subjectName?: string; name?: string; subject?: string; averagePercent: unknown; exams?: { percent: unknown }[]; results?: { percent: unknown }[] }[] }, name: string) =>
    results.subjects.find((x) => (x.subjectName ?? x.name ?? x.subject) === name)!;

  beforeAll(async () => {
    setClock('2026-11-10 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'النسب');
    const ab = await inst.anyAcademicBranch();
    subj.math = await inst.subject('الرياضيات');
    subj.phys = await inst.subject('الفيزياء');
    const teacherPhone = uniquePhone();
    const t = await inst.admin.post('/teachers', {
      fullName: 'أ. رامي الحلبي', phone: teacherPhone, branchIds: [inst.branchId],
      qualifications: [{ academicBranchId: ab, subjectId: subj.math }],
    });
    section = await inst.section({ name: 'التاسع - أ', academicBranchId: ab });
    edgeSection = await inst.section({ name: 'التاسع - ج', academicBranchId: ab });
    await inst.admin.post(`/sections/${section}/subjects`, { subjectId: subj.math, weeklyPeriods: 5, teacherId: t.id ?? t.teacher?.id });
    await inst.admin.post(`/sections/${section}/subjects`, { subjectId: subj.phys, weeklyPeriods: 3 });
    await inst.admin.post(`/sections/${edgeSection}/subjects`, { subjectId: subj.math, weeklyPeriods: 5 });
    for (let i = 1; i <= 4; i++) {
      phones[`S${i}`] = uniquePhone();
      S.push((await inst.student({ fullName: `طالب ${i}`, sectionId: section, newFamily: { familyName: `ع${i}`, fatherName: `أب ${i}`, phone: phones[`S${i}`] } })).id);
    }
    phones.edge = uniquePhone();
    edgeStudent = (await inst.student({ fullName: 'طالب الحد', sectionId: edgeSection, newFamily: { familyName: 'الحد', fatherName: 'أب', phone: phones.edge } })).id;
    teacher = await signIn(s, teacherPhone);

    const a = await inst.admin.post('/exams', { sectionId: section, subjectId: subj.math, title: 'المذاكرة A', examDate: '2026-11-05', maxMark: 20, passMark: 10 });
    await inst.admin.put(`/exams/${a.id}/results`, { results: [18, 16, 14, 12].map((mark, i) => ({ studentId: S[i], mark })) });
    examB = (await inst.admin.post('/exams', { sectionId: section, subjectId: subj.math, title: 'المذاكرة B', examDate: '2026-11-08', maxMark: 50, passMark: 25 })).id;
    await inst.admin.put(`/exams/${examB}/results`, { results: [{ studentId: S[0], mark: 25 }] });
    const edge = await inst.admin.post('/exams', { sectionId: edgeSection, subjectId: subj.math, title: 'مذاكرة الحد', examDate: '2026-11-05', maxMark: 20, passMark: 10 });
    await inst.admin.put(`/exams/${edge.id}/results`, { results: [{ studentId: edgeStudent, mark: 9.75 }] });
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[EXM-20] parents app: S1 has 90.0 and 50.0 in mathematics, subject average 70.0 (plain mean)', async () => {
    const family = await signIn(s, phones.S1);
    const results = await family.get(`/mobile/students/${S[0]}/results`);
    const math = subjectOf(results, 'الرياضيات');
    expect((math.results ?? math.exams ?? []).map((e) => num(e.percent)).sort((x, y) => x - y)).toEqual([50, 90]);
    expect(num(math.averagePercent)).toBe(70);
  });

  it('[EXM-22] dashboard: the section average is weighted by graded count = 70.0 (not 62.5)', async () => {
    const o = await inst.admin.get('/dashboard/overview');
    const row = o.sections.find((x: { name?: string }) => x.name === 'التاسع - أ');
    expect(num(row.averagePercent ?? row.examAverage ?? row.averageExamPercent)).toBe(70);
  });

  it('[EXM-26] pending and absent results never enter an average', async () => {
    const family = await signIn(s, phones.S2);
    const results = await family.get(`/mobile/students/${S[1]}/results`);
    expect(num(subjectOf(results, 'الرياضيات').averagePercent)).toBe(80); // exam B is still pending for S2
  });

  it('[EXM-21] a physics exam of 80 makes S1 overall (90 + 50 + 80) / 3 = 73.3', async () => {
    const p = await inst.admin.post('/exams', { sectionId: section, subjectId: subj.phys, title: 'مذاكرة الفيزياء', examDate: '2026-11-09', maxMark: 10, passMark: 5 });
    await inst.admin.put(`/exams/${p.id}/results`, { results: [{ studentId: S[0], mark: 8 }] });
    const family = await signIn(s, phones.S1);
    const results = await family.get(`/mobile/students/${S[0]}/results`);
    expect(num(results.averagePercent)).toBe(73.3);
    // the transcript says the same (before 2026-11-19 it averaged the subject averages: (70 + 80) / 2 = 75)
    const transcript = await inst.admin.get(`/reports/student-transcript?studentId=${S[0]}&from=2026-09-01&to=2026-11-10`);
    const overall = transcript.blocks.filter((b: { type: string }) => b.type === 'stats').flatMap((b: { items: { label: string; value: unknown }[] }) => b.items).find((i: { label: string }) => i.label === 'المعدل العام');
    expect(overall.value).toBe(73.3);
  });

  it('[EXM-25] rounding edge 9.75 / 20 = 48.75 % shows 48.8 in the parents app and on the dashboard', async () => {
    const family = await signIn(s, phones.edge);
    const results = await family.get(`/mobile/students/${edgeStudent}/results`);
    const math = subjectOf(results, 'الرياضيات');
    expect([num((math.results ?? math.exams)![0].percent), num(math.averagePercent)]).toEqual([48.8, 48.8]);
    const o = await inst.admin.get('/dashboard/overview');
    const row = o.sections.find((x: { name?: string }) => x.name === 'التاسع - ج');
    expect(num(row.averagePercent ?? row.examAverage ?? row.averageExamPercent)).toBe(48.8);
  });

  it('[EXM-30/31] teacher: pending marks show exam B with 3 waiting; upcoming shows only the next 14 days', async () => {
    await inst.admin.post('/exams', { sectionId: section, subjectId: subj.math, title: 'بعد 5 أيام', examDate: '2026-11-15', maxMark: 20, passMark: 10 });
    await inst.admin.post('/exams', { sectionId: section, subjectId: subj.math, title: 'بعد 15 يوماً', examDate: '2026-11-25', maxMark: 20, passMark: 10 });
    const o = await teacher.get('/teacher/overview');
    const pending = o.pendingMarks.find((x: { examId?: number; id?: number }) => (x.examId ?? x.id) === examB);
    expect(pending.pending).toBe(3);
    expect(o.upcomingExams.map((x: { title: string }) => x.title)).toEqual(['بعد 5 أيام']);
  });

  it('[EXM-32] the teacher reads a student\'s results only for the subject he teaches', async () => {
    const res = await teacher.get(`/students/${S[0]}/results`);
    const subjects = new Set(JSON.stringify(res).match(/الرياضيات|الفيزياء/g));
    expect([...subjects]).toEqual(['الرياضيات']);
  });
});
