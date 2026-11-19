/**
 * [T2] 1.4 Roles matrix. Plan: 01-tenancy-auth-roles.md; source of truth: docs/generated/permissions.md.
 * Every role calls one representative endpoint per permission; the expected answer
 * (allowed = 2xx, refused = 403) is written out literally below.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import type { Api } from '../support/client';
import { uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

type Role = 'INSTITUTE_ADMIN' | 'REGISTRAR' | 'DATA_ENTRY' | 'ACCOUNTANT' | 'TEACHER' | 'FAMILY' | 'STUDENT';
type Action =
  | 'dashboard.view' | 'students.view' | 'students.manage' | 'attendance.view' | 'attendance.manage'
  | 'fees.view' | 'fees.manage' | 'exams.view' | 'exams.manage' | 'marks.enter' | 'academic.view'
  | 'academic.manage' | 'settings.view' | 'settings.manage' | 'staff.view' | 'staff.manage' | 'notes.delete';

const Y = true;
const N = false;
// prettier-ignore
const EXPECTED: Record<Role, Record<Action, boolean>> = {
  //               dash   stuV   stuM   attV   attM   feeV   feeM   exV    exM    marks  acaV   acaM   setV   setM   stfV   stfM   noteDel
  INSTITUTE_ADMIN: row(Y,    Y,     Y,     Y,     Y,     Y,     Y,     Y,     Y,     Y,     Y,     Y,     Y,     Y,     Y,     Y,     Y),
  REGISTRAR:       row(Y,    Y,     Y,     Y,     Y,     Y,     N,     Y,     N,     N,     Y,     N,     Y,     N,     N,     N,     Y),
  DATA_ENTRY:      row(Y,    Y,     Y,     Y,     Y,     N,     N,     Y,     N,     Y,     Y,     N,     Y,     N,     N,     N,     N),
  ACCOUNTANT:      row(Y,    Y,     N,     N,     N,     Y,     Y,     N,     N,     N,     Y,     N,     Y,     N,     N,     N,     N),
  TEACHER:         row(N,    N,     N,     Y,     N,     N,     N,     Y,     Y,     Y,     Y,     N,     N,     N,     N,     N,     N),
  FAMILY:          row(N,    N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N),
  STUDENT:         row(N,    N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N,     N),
};

function row(...v: boolean[]): Record<Action, boolean> {
  const keys: Action[] = [
    'dashboard.view', 'students.view', 'students.manage', 'attendance.view', 'attendance.manage', 'fees.view', 'fees.manage',
    'exams.view', 'exams.manage', 'marks.enter', 'academic.view', 'academic.manage', 'settings.view', 'settings.manage',
    'staff.view', 'staff.manage', 'notes.delete',
  ];
  return Object.fromEntries(keys.map((k, i) => [k, v[i]])) as Record<Action, boolean>;
}

describe('[T2] 1.4 roles matrix', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  const users = {} as Record<Role, Api>;
  const ids: Record<string, number> = {};
  let n = 0;

  beforeAll(async () => {
    setClock('2026-11-18 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الأدوار');
    const ab = await inst.anyAcademicBranch();
    ids.subject = await inst.subject('الرياضيات');
    const teacherPhone = uniquePhone();
    const teacher = await inst.admin.post('/teachers', {
      fullName: 'أ. رامي الحلبي', phone: teacherPhone, branchIds: [inst.branchId],
      qualifications: [{ academicBranchId: ab, subjectId: ids.subject }],
    });
    ids.section = await inst.section({ name: 'التاسع - أ', academicBranchId: ab, fee: 1_000_000 });
    await inst.admin.post(`/sections/${ids.section}/subjects`, { subjectId: ids.subject, weeklyPeriods: 3, teacherId: teacher.id ?? teacher.teacher?.id });
    const familyPhone = uniquePhone();
    const st = await inst.student({ fullName: 'يزن الخطيب', sectionId: ids.section, newFamily: { familyName: 'الخطيب', fatherName: 'محمد', phone: familyPhone } });
    ids.student = st.id;
    ids.contract = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st.id)}/contract`, { numberOfInstallments: 2 })).id;
    ids.exam = (await inst.admin.post('/exams', { sectionId: ids.section, subjectId: ids.subject, title: 'مذاكرة', examDate: '2026-11-18', maxMark: 20, passMark: 10 })).id;
    const studentPhone = uniquePhone();
    await inst.admin.post('/accounts/students', { studentId: st.id, phone: studentPhone });

    users.INSTITUTE_ADMIN = inst.admin;
    for (const role of ['REGISTRAR', 'DATA_ENTRY', 'ACCOUNTANT'] as const) {
      const phone = uniquePhone();
      await inst.admin.post('/staff', { fullName: `موظف ${role}`, phone, role });
      users[role] = await signIn(s, phone);
    }
    users.TEACHER = await signIn(s, teacherPhone);
    users.FAMILY = await signIn(s, familyPhone);
    users.STUDENT = await signIn(s, studentPhone);
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  /** One representative call per action (fresh data where a call consumes it). */
  const probe: Record<Action, (u: Api) => Promise<unknown>> = {
    'dashboard.view': (u) => u.get('/dashboard/overview'),
    'students.view': (u) => u.get('/students'),
    'students.manage': (u) => u.patch(`/students/${ids.student}`, { fullName: 'يزن الخطيب' }),
    'attendance.view': (u) => u.get(`/attendance/daily?sectionId=${ids.section}&date=2026-11-18`),
    'attendance.manage': (u) => u.post('/attendance/excuse', { studentId: ids.student, note: 'مرض' }),
    'fees.view': (u) => u.get('/payments'),
    'fees.manage': (u) => u.post(`/contracts/${ids.contract}/payments`, { amount: 1 }),
    'exams.view': (u) => u.get('/exams'),
    'exams.manage': (u) => u.patch(`/exams/${ids.exam}`, { title: 'مذاكرة معدلة' }),
    'marks.enter': (u) => u.put(`/exams/${ids.exam}/results`, { results: [{ studentId: ids.student, mark: 15 }] }),
    'academic.view': (u) => u.get('/subjects'),
    'academic.manage': (u) => u.post('/subjects', { name: `مادة ${++n}` }),
    'settings.view': (u) => u.get('/closures'),
    'settings.manage': (u) => u.post('/closures', { scope: 'INSTITUTE', fromDate: '2027-02-01', toDate: '2027-02-01', reason: `عطلة ${++n}` }),
    'staff.view': (u) => u.get('/staff'),
    'staff.manage': (u) => u.post('/staff', { fullName: `موظف ${++n}`, phone: uniquePhone(), role: 'REGISTRAR' }),
    'notes.delete': async (u) => {
      const note = await inst.admin.post(`/students/${ids.student}/notes`, { body: `ملاحظة ${++n}` });
      return u.del(`/student-notes/${note.id}`);
    },
  };

  it('[ACC-ROLE] every role gets exactly the access of its permission set', async () => {
    const actual = {} as Record<Role, Record<Action, boolean | number>>;
    for (const role of Object.keys(EXPECTED) as Role[]) {
      actual[role] = {} as Record<Action, boolean | number>;
      for (const action of Object.keys(probe) as Action[]) {
        const res = await probe[action](users[role]).then(() => 200).catch((e: Error) => Number(/-> (\d{3})/.exec(e.message)?.[1]));
        // allowed = 2xx, refused = 403; anything else is reported as the raw status
        actual[role][action] = res < 300 ? true : res === 403 ? false : res;
      }
    }
    expect(actual).toEqual(EXPECTED);
  });
});
