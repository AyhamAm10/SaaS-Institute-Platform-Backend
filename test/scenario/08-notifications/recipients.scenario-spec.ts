/**
 * [T5] 8.1 Who receives what, with the exact Arabic text. Plan: 08-notifications.md
 * Family الخطيب: يزن (male, has his own student account) and سلمى (female, no account), both in التاسع - أ.
 * Family العمر: عمر in the same section. Teachers: رامي (mathematics, التاسع - أ), لينا (English).
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { settled, waitFor } from '../support/notify';

describe('[T5] 8.1 recipients and texts', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let other: InstituteFixture;
  let section: number;
  const subj: Record<string, number> = {};
  const id: Record<string, number> = {};
  const u = {} as Record<'family' | 'yazan' | 'omarFamily' | 'rami' | 'lina', Api>;

  beforeAll(async () => {
    setClock('2026-11-18 07:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'المستلمون');
    other = await InstituteFixture.create(s, 'معهد بعيد');
    const ab = await inst.anyAcademicBranch();
    subj.math = await inst.subject('الرياضيات');
    subj.en = await inst.subject('اللغة الإنكليزية');
    const phones = { family: uniquePhone(), yazan: uniquePhone(), omarFamily: uniquePhone(), rami: uniquePhone(), lina: uniquePhone() };
    const rami = await inst.admin.post('/teachers', { fullName: 'أ. رامي الحلبي', phone: phones.rami, branchIds: [inst.branchId], qualifications: [{ academicBranchId: ab, subjectId: subj.math }] });
    const lina = await inst.admin.post('/teachers', { fullName: 'أ. لينا الشامي', phone: phones.lina, branchIds: [inst.branchId], qualifications: [{ academicBranchId: ab, subjectId: subj.en }] });
    id.rami = rami.id ?? rami.teacher?.id;
    id.lina = lina.id ?? lina.teacher?.id;
    section = await inst.section({ name: 'التاسع - أ', academicBranchId: ab });
    await inst.admin.post(`/sections/${section}/subjects`, { subjectId: subj.math, weeklyPeriods: 5, teacherId: id.rami });
    const yazan = await inst.student({ fullName: 'يزن الخطيب', sectionId: section, newFamily: { familyName: 'الخطيب', fatherName: 'محمد الخطيب', phone: phones.family } });
    id.yazan = yazan.id;
    id.salma = (await inst.student({ fullName: 'سلمى الخطيب', gender: 'FEMALE', sectionId: section, familyId: yazan.familyId })).id;
    id.omar = (await inst.student({ fullName: 'عمر العمر', sectionId: section, newFamily: { familyName: 'العمر', fatherName: 'أحمد العمر', phone: phones.omarFamily } })).id;
    await inst.admin.post('/accounts/students', { studentId: id.yazan, phone: phones.yazan });
    for (const k of Object.keys(phones) as (keyof typeof phones)[]) u[k] = await signIn(s, phones[k]);
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[NTF-01] an on-time arrival tells the family only', async () => {
    setClock('2026-11-18 08:05');
    await inst.admin.post('/attendance/check-in', { studentId: id.yazan });
    const [n] = await waitFor(u.family, 'ATTENDANCE_ARRIVAL');
    expect([n.title, n.body, n.studentId]).toEqual(['وصل يزن الخطيب إلى المعهد', 'سُجّل الحضور الساعة 08:05', id.yazan]);
    expect(await settled(u.yazan, 'ATTENDANCE_ARRIVAL')).toHaveLength(0);
    expect(await settled(u.rami, 'ATTENDANCE_ARRIVAL')).toHaveLength(0); // teachers hear nothing about attendance
  });

  it('[NTF-02] a late girl without her own account: the family only, in the feminine form', async () => {
    setClock('2026-11-18 08:40');
    await inst.admin.post('/attendance/check-in', { studentId: id.salma });
    const [n] = await waitFor(u.family, 'ATTENDANCE_LATE');
    expect([n.title, n.body]).toEqual(['سلمى الخطيب متأخرة اليوم', 'وصلت إلى المعهد الساعة 08:40']);
    expect(await settled(u.yazan, 'ATTENDANCE_LATE')).toHaveLength(0); // he does not hear about his sister
  });

  it('[NTF-03] a late boy with his own account: the family AND the student', async () => {
    setClock('2026-11-18 08:50');
    await inst.admin.post('/attendance/check-in', { studentId: id.omar });
    await waitFor(u.omarFamily, 'ATTENDANCE_LATE');
    expect(await settled(u.family, 'ATTENDANCE_LATE')).toHaveLength(1); // only سلمى's, not عمر's
  });

  it('[NTF-04] an early exit with its reason: the family and the student', async () => {
    setClock('2026-11-18 13:00');
    await inst.admin.post('/attendance/check-out', { studentId: id.yazan, note: 'موعد طبيب، استلمه والده' });
    const [n] = await waitFor(u.yazan, 'ATTENDANCE_EARLY_EXIT');
    expect([n.title, n.body]).toEqual(['خروج مبكر: يزن الخطيب', 'غادر المعهد الساعة 13:00 - موعد طبيب، استلمه والده']);
    await waitFor(u.family, 'ATTENDANCE_EARLY_EXIT');
  });

  it('[NTF-05] a payment: the family only, with receipt and amount', async () => {
    const c = await inst.admin.post(`/enrollments/${await inst.enrollmentOf(id.yazan)}/contract`, { grossAmount: 1_000_000, numberOfInstallments: 2 });
    const p = await inst.admin.post(`/contracts/${c.id}/payments`, { amount: 300_000 });
    const [n] = await waitFor(u.family, 'PAYMENT_RECEIVED');
    expect([n.title, n.body]).toEqual(['تم استلام دفعة', `إيصال رقم ${p.receiptNumber}: 300,000 ل.س عن يزن الخطيب`]);
    expect(await settled(u.yazan, 'PAYMENT_RECEIVED')).toHaveLength(0);
  });

  it('[NTF-06] a note for the family reaches the family; an internal note reaches nobody', async () => {
    await inst.admin.post(`/students/${id.yazan}/notes`, { body: 'تم تسليم كتاب الرياضيات', visibleToFamily: true });
    await inst.admin.post(`/students/${id.yazan}/notes`, { body: 'ملاحظة داخلية', visibleToFamily: false });
    const notes = await waitFor(u.family, 'STUDENT_NOTE');
    expect(notes.map((n) => n.body)).toEqual(['يزن الخطيب: تم تسليم كتاب الرياضيات']);
    expect(await settled(u.family, 'STUDENT_NOTE')).toHaveLength(1);
    expect(await settled(u.yazan, 'STUDENT_NOTE')).toHaveLength(0);
  });

  it('[NTF-07] an exam by the admin: one notice per child (the family gets 2), the student, and the teacher', async () => {
    const exam = await inst.admin.post('/exams', { sectionId: section, subjectId: subj.math, title: 'المذاكرة الأولى', examDate: '2026-11-20', maxMark: 20, passMark: 10 });
    const forFamily = await waitFor(u.family, 'EXAM_SCHEDULED', 2);
    expect(forFamily.map((n) => n.body).sort()).toEqual([
      'المذاكرة الأولى يوم 2026/11/20 - سلمى الخطيب',
      'المذاكرة الأولى يوم 2026/11/20 - يزن الخطيب',
    ]);
    expect(forFamily[0].title).toBe('مذاكرة جديدة: الرياضيات');
    await waitFor(u.yazan, 'EXAM_SCHEDULED');
    const [t] = await waitFor(u.rami, 'TEACHER_EXAM_CREATED');
    expect([t.title, t.body]).toEqual(['مذاكرة جديدة في مادتك', 'المذاكرة الأولى - التاسع - أ يوم 2026/11/20']);
    id.exam = exam.id;
  });

  it('[NTF-07b] an exam the teacher creates himself does not notify him', async () => {
    await u.rami.post('/exams', { sectionId: section, subjectId: subj.math, title: 'مذاكرة الأستاذ', examDate: '2026-11-25', maxMark: 20, passMark: 10 });
    expect(await settled(u.rami, 'TEACHER_EXAM_CREATED')).toHaveLength(1); // still only the admin's exam
  });

  it('[NTF-08] marks: "18 out of 20" to the student and the family; an absent child is told so', async () => {
    await inst.admin.put(`/exams/${id.exam}/results`, { results: [{ studentId: id.yazan, mark: 18 }, { studentId: id.salma, absent: true }] });
    const [mine] = await waitFor(u.yazan, 'EXAM_RESULT');
    expect([mine.title, mine.body]).toEqual(['صدرت علامة الرياضيات', 'يزن الخطيب: 18 من 20 في المذاكرة الأولى']);
    const family = await waitFor(u.family, 'EXAM_RESULT', 2);
    expect(family.map((n) => n.body).sort()).toEqual(['سلمى الخطيب: غائب عن المذاكرة الأولى', 'يزن الخطيب: 18 من 20 في المذاكرة الأولى']);
  });

  it('[NTF-09] a closure: ONE notice per person, even for a family with two children', async () => {
    await inst.admin.post('/closures', { scope: 'INSTITUTE', fromDate: '2026-12-01', toDate: '2026-12-01', reason: 'عيد' });
    const [n] = await waitFor(u.family, 'CLOSURE');
    expect([n.title, n.body]).toEqual(['عطلة: عيد', 'يوم 2026/12/01']);
    for (const user of [u.family, u.yazan, u.omarFamily, u.rami]) expect(await settled(user, 'CLOSURE')).toHaveLength(1);
  });

  it('[NTF-10] assigning لينا to English notifies her only; re-saving the same teacher sends nothing', async () => {
    await inst.admin.post(`/sections/${section}/subjects`, { subjectId: subj.en, weeklyPeriods: 3, teacherId: id.lina });
    const [n] = await waitFor(u.lina, 'TEACHER_ASSIGNED');
    expect([n.title, n.body]).toEqual(['إسناد جديد', 'أُسندت إليك مادة اللغة الإنكليزية في التاسع - أ']);
    await inst.admin.patch(`/sections/${section}/subjects/${subj.en}`, { teacherId: id.lina, weeklyPeriods: 4 });
    expect(await settled(u.lina, 'TEACHER_ASSIGNED')).toHaveLength(1);
    // رامي keeps only his own assignment notice from the setup (mathematics), nothing about لينا's
    expect((await settled(u.rami, 'TEACHER_ASSIGNED')).map((n) => n.body)).toEqual(['أُسندت إليك مادة الرياضيات في التاسع - أ']);
  });

  it('[NTF-11] events in another institute reach nobody here', async () => {
    const before = (await settled(u.family)).length;
    const st = await other.student({ fullName: 'طالب بعيد', newFamily: { familyName: 'بعيد' } });
    await other.admin.post(`/students/${st.id}/notes`, { body: 'ملاحظة بعيدة' });
    expect((await settled(u.family)).length).toBe(before);
  });
});
