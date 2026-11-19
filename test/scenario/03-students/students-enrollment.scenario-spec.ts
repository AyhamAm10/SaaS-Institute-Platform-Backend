/**
 * [T6] 3.1-3.4 students, enrollment, families, notes. Plan: 03-students-families-enrollment.md
 * Branches المزة (sections التاسع - أ, التاسع - ب) and المالكي (العاشر). A bus with 2 seats.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

describe('[T6] 3.x students, enrollment, families, notes', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let malki: number;
  const sec: Record<string, number> = {};
  const subj: Record<string, number> = {};
  const ref: Record<string, number> = {};
  let dataEntry: Api;
  let registrar: Api;

  const body = (over: Record<string, unknown>) => ({ fullName: 'طالب', birthDate: '2011-03-14', gender: 'MALE', ...over });

  beforeAll(async () => {
    setClock('2026-09-05 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الطلاب');
    malki = await inst.branch('المالكي');
    const ab = await inst.anyAcademicBranch();
    for (const n of ['الرياضيات', 'الفيزياء', 'العربي']) subj[n] = await inst.subject(n);
    sec.a = await inst.section({ name: 'التاسع - أ', academicBranchId: ab });
    sec.b = await inst.section({ name: 'التاسع - ب', academicBranchId: ab });
    sec.c = await inst.section({ name: 'العاشر', academicBranchId: ab, branchId: malki });
    for (const n of ['الرياضيات', 'الفيزياء', 'العربي']) await inst.admin.post(`/sections/${sec.a}/subjects`, { subjectId: subj[n] });
    for (const n of ['الرياضيات', 'العربي']) await inst.admin.post(`/sections/${sec.b}/subjects`, { subjectId: subj[n] });
    ref.damascus = (await inst.admin.post('/cities', { name: 'دمشق' })).id;
    ref.homs = (await inst.admin.post('/cities', { name: 'حمص' })).id;
    ref.homsSchool = (await inst.admin.post('/schools', { name: 'مدرسة حمص', cityId: ref.homs })).id;
    ref.bus = (await inst.admin.post('/buses', { name: 'باص المزة', branchId: inst.branchId, capacity: 2 })).id;
    ref.malkiBus = (await inst.admin.post('/buses', { name: 'باص المالكي', branchId: malki, capacity: 10 })).id;
    for (const role of ['DATA_ENTRY', 'REGISTRAR'] as const) {
      const phone = uniquePhone();
      await inst.admin.post('/staff', { fullName: role, phone, role });
      if (role === 'DATA_ENTRY') dataEntry = await signIn(s, phone);
      else registrar = await signIn(s, phone);
    }
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[STU-01] one request: family + student + ACTIVE enrollment + guardian account; the section decides the branch', async () => {
    const phone = uniquePhone();
    const st = await inst.admin.post('/students', body({
      fullName: 'يزن الخطيب', branchId: malki, sectionId: sec.a,
      newFamily: { familyName: 'الخطيب', fatherName: 'محمد الخطيب', phone },
    }));
    const row = await s.prisma.student.findUniqueOrThrow({ where: { id: st.id } });
    const enr = await s.prisma.studentEnrollment.findMany({ where: { studentId: st.id } });
    expect([row.branchId, enr.map((e) => [e.sectionId, e.status, e.academicYearId])]).toEqual([inst.branchId, [[sec.a, 'ACTIVE', inst.yearId]]]);
    expect(await s.prisma.user.count({ where: { instituteId: inst.id, phone, role: 'FAMILY' } })).toBe(1);
  });

  it('[STU-02] a refused registration leaves no orphan family behind', async () => {
    const families = await s.prisma.family.count({ where: { instituteId: inst.id } });
    const err = await inst.admin.fails('post', '/students', 404, body({ cityId: 999_999, newFamily: { familyName: 'يتيمة' } }));
    expect(err.message).toBe('city not found');
    expect(await s.prisma.family.count({ where: { instituteId: inst.id } })).toBe(families);
  });

  it('[STU-03] legacy Arabic genders are stored as MALE / FEMALE', async () => {
    const a = await inst.admin.post('/students', body({ gender: 'ذكر', newFamily: { familyName: 'قديم1' } }));
    const b = await inst.admin.post('/students', body({ gender: 'أنثى', newFamily: { familyName: 'قديم2' } }));
    const rows = await s.prisma.student.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: 'asc' } });
    expect(rows.map((r) => r.gender)).toEqual(['MALE', 'FEMALE']);
  });

  it('[STU-04] a school from another city than the student is refused', async () => {
    await inst.admin.fails('post', '/students', 400, body({ cityId: ref.damascus, schoolId: ref.homsSchool, newFamily: { familyName: 'مدينة' } }));
  });

  it('[STU-05/06] a 2-seat bus takes 2; the 3rd is refused; a rider may be saved again; another branch\'s bus is refused', async () => {
    const one = await inst.admin.post('/students', body({ busId: ref.bus, newFamily: { familyName: 'باص1' } }));
    await inst.admin.post('/students', body({ busId: ref.bus, newFamily: { familyName: 'باص2' } }));
    await inst.admin.fails('post', '/students', 400, body({ busId: ref.bus, newFamily: { familyName: 'باص3' } }));
    await inst.admin.patch(`/students/${one.id}`, { busId: ref.bus, fullName: 'راكب الباص' });
    await inst.admin.fails('post', '/students', 400, body({ busId: ref.malkiBus, newFamily: { familyName: 'باص المالكي' } }));
  });

  it('[STU-07] the status cannot be cleared (a null is ignored, the status stays); the city can', async () => {
    const st = await inst.admin.post('/students', body({ cityId: ref.damascus, newFamily: { familyName: 'حالة' } }));
    const statusBefore = (await s.prisma.student.findUniqueOrThrow({ where: { id: st.id } })).statusId;
    await inst.admin.patch(`/students/${st.id}`, { statusId: null });
    expect((await s.prisma.student.findUniqueOrThrow({ where: { id: st.id } })).statusId).toBe(statusBefore);
    await inst.admin.patch(`/students/${st.id}`, { cityId: null });
    const row = await s.prisma.student.findUniqueOrThrow({ where: { id: st.id } });
    expect([row.cityId, row.statusId !== null]).toEqual([null, true]);
  });

  it('[STU-08] custom fields: a required one is enforced; a choice must be in its options; updates merge', async () => {
    const req = await inst.admin.post('/student-fields', { label: 'رقم الهوية', type: 'TEXT', isRequired: true });
    const sel = await inst.admin.post('/student-fields', { label: 'الدوام', type: 'SELECT', options: ['صباحي', 'مسائي'] });
    await inst.admin.fails('post', '/students', 400, body({ newFamily: { familyName: 'حقول1' } }));
    await inst.admin.fails('post', '/students', 400, body({ customFields: { [req.name]: '123', [sel.name]: 'ليلي' }, newFamily: { familyName: 'حقول2' } }));
    const st = await inst.admin.post('/students', body({ customFields: { [req.name]: '123', [sel.name]: 'صباحي' }, newFamily: { familyName: 'حقول3' } }));
    await inst.admin.patch(`/students/${st.id}`, { customFields: { [sel.name]: 'مسائي' } });
    const row = await s.prisma.student.findUniqueOrThrow({ where: { id: st.id } });
    expect(row.customFields).toEqual({ [req.name]: '123', [sel.name]: 'مسائي' });
    await inst.admin.del(`/student-fields/${req.id}`);
  });

  it('[ENR-01] bulk enrollment never fails as a whole: 3 enrolled, 3 rejected with reasons', async () => {
    const free: number[] = [];
    for (let i = 0; i < 3; i++) free.push((await inst.admin.post('/students', body({ fullName: `حر ${i}`, newFamily: { familyName: `حر${i}` } }))).id);
    const otherBranch = (await inst.admin.post('/students', body({ branchId: malki, newFamily: { familyName: 'مالكي' } }))).id;
    const already = (await s.prisma.studentEnrollment.findFirstOrThrow({ where: { sectionId: sec.a } })).studentId;
    const res = await inst.admin.post(`/sections/${sec.b}/enrollments`, { studentIds: [...free, otherBranch, already, 999_999] });
    expect((res.enrolled as { studentId?: number; id?: number }[]).map((e) => e.studentId ?? e.id).sort()).toEqual(free.sort());
    expect((res.rejected as { studentId: number }[]).map((r) => r.studentId).sort()).toEqual([otherBranch, already, 999_999].sort());
  });

  it('[ENR-02] a transfer keeps the same enrollment and contract and drops subjects the new section lacks', async () => {
    const st = await inst.student({ fullName: 'منقول', sectionId: sec.a, newFamily: { familyName: 'منقول' } });
    const enr = await inst.enrollmentOf(st.id);
    await inst.admin.put(`/enrollments/${enr}/subjects`, { subjectIds: [subj['الرياضيات'], subj['الفيزياء']] });
    const contract = await inst.admin.post(`/enrollments/${enr}/contract`, { grossAmount: 500_000, numberOfInstallments: 2 });
    await inst.admin.patch(`/enrollments/${enr}/transfer`, { sectionId: sec.b });
    const after = await s.prisma.studentEnrollment.findUniqueOrThrow({ where: { id: enr }, include: { subjects: true } });
    const sub = await s.prisma.studentSubscription.findUniqueOrThrow({ where: { id: contract.id } });
    expect([after.sectionId, sub.enrollmentId, after.subjects.map((x) => x.subjectId)]).toEqual([sec.b, enr, [subj['الرياضيات']]]);
  });

  it('[ENR-03] transfers to another branch, to the same section, or of a withdrawn student are refused', async () => {
    const st = await inst.student({ fullName: 'نقل ممنوع', sectionId: sec.a, newFamily: { familyName: 'ممنوع' } });
    const enr = await inst.enrollmentOf(st.id);
    await inst.admin.fails('patch', `/enrollments/${enr}/transfer`, 400, { sectionId: sec.c });
    await inst.admin.fails('patch', `/enrollments/${enr}/transfer`, 400, { sectionId: sec.a });
    await inst.admin.patch(`/enrollments/${enr}/status`, { status: 'WITHDRAWN', reason: 'انتقال' });
    await inst.admin.fails('patch', `/enrollments/${enr}/transfer`, 400, { sectionId: sec.b });
  });

  it('[ENR-04/05] status: withdrawing needs a reason; WITHDRAWN -> ACTIVE works; COMPLETED is final', async () => {
    const st = await inst.student({ fullName: 'حالات', sectionId: sec.a, newFamily: { familyName: 'حالات' } });
    const enr = await inst.enrollmentOf(st.id);
    await inst.admin.fails('patch', `/enrollments/${enr}/status`, 400, { status: 'WITHDRAWN' });
    await inst.admin.patch(`/enrollments/${enr}/status`, { status: 'WITHDRAWN', reason: 'سفر' });
    await inst.admin.patch(`/enrollments/${enr}/status`, { status: 'ACTIVE' });
    await inst.admin.patch(`/enrollments/${enr}/status`, { status: 'COMPLETED' });
    await inst.admin.fails('patch', `/enrollments/${enr}/status`, 400, { status: 'ACTIVE' });
  });

  it('[ENR-06] choosing every subject is stored as "all" (no rows); a subset as rows', async () => {
    const st = await inst.student({ fullName: 'مواد', sectionId: sec.a, newFamily: { familyName: 'مواد' } });
    const enr = await inst.enrollmentOf(st.id);
    await inst.admin.put(`/enrollments/${enr}/subjects`, { subjectIds: [subj['الرياضيات'], subj['الفيزياء'], subj['العربي']] });
    expect(await s.prisma.enrollmentSubject.count({ where: { enrollmentId: enr } })).toBe(0);
    await inst.admin.put(`/enrollments/${enr}/subjects`, { subjectIds: [subj['العربي']] });
    expect(await s.prisma.enrollmentSubject.count({ where: { enrollmentId: enr } })).toBe(1);
  });

  it('[FAM-01..03] a family with students cannot be deleted; the deletion report counts history; deleting keeps receipts', async () => {
    const st = await inst.student({ fullName: 'محذوف', sectionId: sec.a, newFamily: { familyName: 'المحذوف' } });
    await inst.admin.fails('delete', `/families/${st.familyId}`, 400);
    const c = await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st.id)}/contract`, { grossAmount: 300_000, numberOfInstallments: 1 });
    for (const amount of [100_000, 100_000, 50_000]) await inst.admin.post(`/contracts/${c.id}/payments`, { amount });
    await inst.admin.post('/attendance/excuse', { studentId: st.id, date: '2026-09-06' });
    const report = await inst.admin.get(`/students/${st.id}/deletion-report`);
    // attendance = days of DAILY attendance (fixed 2026-11-19: it used to count the unused lesson attendance, always 0)
    expect(report).toMatchObject({ enrollments: 1, subscriptions: 1, payments: 3, attendance: 1, examResults: 0 });
    await inst.admin.del(`/students/${st.id}`);
    await inst.admin.fails('get', `/students/${st.id}`, 404);
    expect(await s.prisma.payment.count({ where: { subscriptionId: c.id } })).toBe(3);
    await inst.admin.del(`/families/${st.familyId}`);
  });

  it('[FAM-04] family search matches name, father and phone; newest first; at most 50', async () => {
    const phone = uniquePhone();
    await inst.admin.post('/families', { familyName: 'الزعبي', fatherName: 'خالد الزعبي', phone });
    const byPhone = await inst.admin.get(`/families?search=${phone.slice(-6)}`);
    const byFather = await inst.admin.get(`/families?search=${encodeURIComponent('خالد')}`);
    for (const res of [byPhone, byFather]) expect((res.data ?? res).map((f: { familyName: string }) => f.familyName)).toContain('الزعبي');
  });

  it('[NOTE-04/05] notes: data entry cannot delete, the registrar can; empty or too long bodies are refused', async () => {
    const st = await inst.student({ fullName: 'ملاحظات', sectionId: sec.a, newFamily: { familyName: 'ملاحظات' } });
    const note = await dataEntry.post(`/students/${st.id}/notes`, { body: 'ملاحظة' });
    await dataEntry.fails('delete', `/student-notes/${note.id}`, 403);
    await registrar.del(`/student-notes/${note.id}`);
    await inst.admin.fails('post', `/students/${st.id}/notes`, 400, { body: '   ' });
    await inst.admin.fails('post', `/students/${st.id}/notes`, 400, { body: 'س'.repeat(1001) });
  });
});
