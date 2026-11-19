/**
 * [T4] 6.1 exam rules and permissions, 6.2 the mark sheet. Plan: 06-exams-marks.md
 * Section التاسع - أ: S1..S6; S6 studies everything EXCEPT mathematics.
 * Teacher رامي teaches mathematics in this section only.
 * Mathematics exam: max 20, pass 10. Marks S1 18, S2 15.5, S3 9.75, S4 20, S5 absent.
 * Golden: statuses PASSED PASSED FAILED PASSED ABSENT ; average of graded = 63.25 / 4 = 15.81 ;
 *         passed 3, failed 1, absent 1, pending 5 - 4 - 1 = 0 ; pass mark 16 -> S2 becomes FAILED
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { num } from '../support/money';

describe('[T4] 6.1-6.2 exams and the mark sheet', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let teacher: Api;
  let registrar: Api;
  let dataEntry: Api;
  let accountant: Api;
  let section: number;
  let otherSection: number;
  const subj: Record<string, number> = {};
  const S: number[] = [];
  let examId: number;

  const staff = async (role: string) => {
    const phone = uniquePhone();
    await inst.admin.post('/staff', { fullName: `موظف ${role}`, phone, role });
    return signIn(s, phone);
  };

  /** The sheet as [studentId, mark, status, eligible] rows, sorted by student. */
  const sheet = async (id = examId) => {
    const res = await inst.admin.get(`/exams/${id}/results`);
    const rows = (res.rows ?? res.students ?? res.sheet ?? res) as { student: { id: number }; eligible: boolean; result: { mark: unknown; status: string } | null }[];
    return { res, rows: rows.map((r) => [r.student.id, r.result?.mark == null ? null : num(r.result.mark), r.result?.status ?? 'PENDING', r.eligible]).sort((a, b) => (a[0] as number) - (b[0] as number)) };
  };

  beforeAll(async () => {
    setClock('2026-11-18 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'المذاكرات');
    const ab = await inst.anyAcademicBranch();
    for (const n of ['الرياضيات', 'الفيزياء', 'الكيمياء']) subj[n] = await inst.subject(n);
    const teacherPhone = uniquePhone();
    const t = await inst.admin.post('/teachers', {
      fullName: 'أ. رامي الحلبي', phone: teacherPhone, branchIds: [inst.branchId],
      qualifications: [{ academicBranchId: ab, subjectId: subj['الرياضيات'] }],
    });
    section = await inst.section({ name: 'التاسع - أ', academicBranchId: ab });
    otherSection = await inst.section({ name: 'التاسع - ب', academicBranchId: ab });
    await inst.admin.post(`/sections/${section}/subjects`, { subjectId: subj['الرياضيات'], weeklyPeriods: 5, teacherId: t.id ?? t.teacher?.id });
    await inst.admin.post(`/sections/${section}/subjects`, { subjectId: subj['الفيزياء'], weeklyPeriods: 3 });
    await inst.admin.post(`/sections/${otherSection}/subjects`, { subjectId: subj['الرياضيات'], weeklyPeriods: 5 });
    for (let i = 1; i <= 6; i++) S.push((await inst.student({ fullName: `طالب ${i}`, sectionId: section, newFamily: { familyName: `ع${i}` } })).id);
    await inst.admin.put(`/enrollments/${await inst.enrollmentOf(S[5])}/subjects`, { subjectIds: [subj['الفيزياء']] });
    teacher = await signIn(s, teacherPhone);
    [registrar, dataEntry, accountant] = [await staff('REGISTRAR'), await staff('DATA_ENTRY'), await staff('ACCOUNTANT')];
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  const exam = (over: Record<string, unknown> = {}) => ({
    sectionId: section, subjectId: subj['الرياضيات'], title: 'المذاكرة الأولى', examDate: '2026-11-18', maxMark: 20, passMark: 10, ...over,
  });

  it('[EXM-01..03] refused: subject not in the plan, date outside the year, impossible marks', async () => {
    expect((await inst.admin.fails('post', '/exams', 400, exam({ subjectId: subj['الكيمياء'] }))).message).toMatch(/plan|section/i);
    expect((await inst.admin.fails('post', '/exams', 400, exam({ examDate: '2027-08-01' }))).message).toMatch(/year/i);
    await inst.admin.fails('post', '/exams', 400, exam({ passMark: 0 }));
    await inst.admin.fails('post', '/exams', 400, exam({ passMark: 21 }));
    expect(await s.prisma.exam.count({ where: { instituteId: inst.id } })).toBe(0);
  });

  it('[EXM-04] the teacher creates exams only for the subject he teaches in his section', async () => {
    examId = (await teacher.post('/exams', exam())).id;
    await teacher.fails('post', '/exams', 403, exam({ subjectId: subj['الفيزياء'] }));
    const other = await teacher.call('post', '/exams', exam({ sectionId: otherSection }), { status: undefined as never }).catch((e: Error) => e.message);
    expect(String(other)).toMatch(/-> (403|404)/);
  });

  it('[EXM-05/06] marks: data entry may enter, the registrar may only read, the accountant sees nothing', async () => {
    await registrar.get(`/exams/${examId}/results`);
    await registrar.fails('put', `/exams/${examId}/results`, 403, { results: [{ studentId: S[0], mark: 1 }] });
    await dataEntry.put(`/exams/${examId}/results`, { results: [{ studentId: S[0], mark: 1 }] });
    await accountant.fails('get', `/exams/${examId}`, 403);
  });

  it('[EXM-10] the sheet lists the 5 students who study mathematics; S6 is not on it', async () => {
    const { rows } = await sheet();
    expect(rows.map((r) => r[0])).toEqual(S.slice(0, 5));
  });

  it('[EXM-11] one student not on the sheet refuses the whole save (nothing is written)', async () => {
    const before = await s.prisma.examResult.findMany({ where: { examId } });
    await inst.admin.fails('put', `/exams/${examId}/results`, 400, {
      results: [{ studentId: S[1], mark: 15 }, { studentId: S[5], mark: 10 }],
    });
    expect((await s.prisma.examResult.findMany({ where: { examId } })).map((r) => [r.studentId, num(r.mark)])).toEqual(before.map((r) => [r.studentId, num(r.mark)]));
  });

  it('[EXM-12/13] statuses are computed by the server; an absent mark is dropped; stats 15.81 / 3 / 1 / 1 / 0', async () => {
    await inst.admin.put(`/exams/${examId}/results`, {
      results: [
        { studentId: S[0], mark: 18 }, { studentId: S[1], mark: 15.5 }, { studentId: S[2], mark: 9.75 },
        { studentId: S[3], mark: 20 }, { studentId: S[4], mark: 12, absent: true },
      ],
    });
    const { res, rows } = await sheet();
    expect(rows).toEqual([
      [S[0], 18, 'PASSED', true], [S[1], 15.5, 'PASSED', true], [S[2], 9.75, 'FAILED', true],
      [S[3], 20, 'PASSED', true], [S[4], null, 'ABSENT', true],
    ]);
    expect(res.stats).toMatchObject({ average: 15.81, passed: 3, failed: 1, absent: 1, pending: 0 });
  });

  it('[EXM-14] marks above the maximum, negative or with 3 decimals are refused', async () => {
    for (const mark of [20.5, -1, 12.345]) {
      await inst.admin.fails('put', `/exams/${examId}/results`, 400, { results: [{ studentId: S[0], mark }] });
    }
    expect(num((await s.prisma.examResult.findFirstOrThrow({ where: { examId, studentId: S[0] } })).mark)).toBe(18);
  });

  it('[EXM-15] raising the pass mark to 16 recomputes the statuses without re-entering marks', async () => {
    await inst.admin.patch(`/exams/${examId}`, { passMark: 16 });
    expect((await sheet()).rows.map((r) => r[2])).toEqual(['PASSED', 'FAILED', 'FAILED', 'PASSED', 'ABSENT']);
  });

  it('[EXM-16] the maximum cannot go below an entered mark', async () => {
    await inst.admin.fails('patch', `/exams/${examId}`, 400, { maxMark: 19 });
  });

  it('[EXM-17] a student moved to another section keeps his mark on the sheet, marked not eligible', async () => {
    await inst.admin.patch(`/enrollments/${await inst.enrollmentOf(S[1])}/transfer`, { sectionId: otherSection });
    const row = (await sheet()).rows.find((r) => r[0] === S[1]);
    expect(row).toEqual([S[1], 15.5, 'FAILED', false]);
  });

  it('[EXM-18] deleting an exam with results needs force; then exam and results go together', async () => {
    await inst.admin.fails('delete', `/exams/${examId}`, 409);
    await inst.admin.del(`/exams/${examId}?force=true`);
    expect([await s.prisma.exam.count({ where: { id: examId } }), await s.prisma.examResult.count({ where: { examId } })]).toEqual([0, 0]);
  });
});
