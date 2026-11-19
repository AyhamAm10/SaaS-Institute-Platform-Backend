/**
 * [T5] 8.4 hourly reminders, 8.5 the lesson reminder. Plan: 08-notifications.md
 * Hourly reminders run only between 09:00 and 20:59 local. Lesson reminder: a lesson
 * starting within the next 15 minutes, once per lesson and day.
 * Wednesday 2026-11-18 timetable of رامي (التاسع - أ): 10:00 (قاعة 4), 12:15, 13:00.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { AttendanceProcessor } from '../../../src/modules/attendance/jobs/attendance.processor';
import { FeesProcessor } from '../../../src/modules/fees/jobs/fees.processor';
import { NotificationsProcessor } from '../../../src/modules/notifications/notifications.processor';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { settled, waitFor } from '../support/notify';

describe('[T5] 8.4-8.5 reminders', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let section: number;
  let subject: number;
  let teacherId: number;
  let rami: Api;
  const fam: Record<string, Api> = {};
  const st: Record<string, number> = {};

  const reminders = () => s.runJob(NotificationsProcessor, 'send-reminders', inst.id);
  const lessons = () => s.runJob(NotificationsProcessor, 'send-lesson-reminders', inst.id);

  beforeAll(async () => {
    setClock('2026-11-10 07:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'التذكيرات');
    const ab = await inst.anyAcademicBranch();
    subject = await inst.subject('الرياضيات');
    const ramiPhone = uniquePhone();
    const t = await inst.admin.post('/teachers', { fullName: 'أ. رامي', phone: ramiPhone, branchIds: [inst.branchId], qualifications: [{ academicBranchId: ab, subjectId: subject }] });
    teacherId = t.id ?? t.teacher?.id;
    section = await inst.section({ name: 'التاسع - أ', academicBranchId: ab });
    await inst.admin.post(`/sections/${section}/subjects`, { subjectId: subject, weeklyPeriods: 5, teacherId });
    for (const k of ['due1', 'due3', 'due4', 'absent']) {
      const phone = uniquePhone();
      st[k] = (await inst.student({ fullName: `طالب ${k}`, sectionId: section, newFamily: { familyName: k, fatherName: 'أب', phone } })).id;
      fam[k] = await signIn(s, phone);
    }
    rami = await signIn(s, ramiPhone);
    const room = await inst.admin.post('/rooms', { name: 'قاعة 4', capacity: 30, branchId: inst.branchId });
    const path = `/academic-years/${inst.yearId}/sections/${section}/timetable/entries`;
    await inst.admin.post(path, { subjectId: subject, teacherId, roomId: room.id, dayOfWeek: 3, startTime: '10:00', endTime: '10:45' });
    await inst.admin.post(path, { subjectId: subject, teacherId, dayOfWeek: 3, startTime: '12:15', endTime: '13:00' });
    await inst.admin.post(path, { subjectId: subject, teacherId, dayOfWeek: 3, startTime: '13:00', endTime: '13:45' });
    // exams for the marks reminder: 5 days ago without marks, 5 days ago with one mark, 15 days ago without
    await inst.admin.post('/exams', { sectionId: section, subjectId: subject, title: 'بلا علامات', examDate: '2026-11-13', maxMark: 20, passMark: 10 });
    const withMark = await inst.admin.post('/exams', { sectionId: section, subjectId: subject, title: 'بعلامة واحدة', examDate: '2026-11-13', maxMark: 20, passMark: 10 });
    await inst.admin.put(`/exams/${withMark.id}/results`, { results: [{ studentId: st.due1, mark: 10 }] });
    await inst.admin.post('/exams', { sectionId: section, subjectId: subject, title: 'قديمة', examDate: '2026-11-03', maxMark: 20, passMark: 10 });
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[NTF-40] reminders stay quiet at 08:59 and at 21:00', async () => {
    setClock('2026-11-18 08:59');
    expect(await reminders()).toBe(0);
    setClock('2026-11-18 21:00');
    expect(await reminders()).toBe(0);
  });

  it('[NTF-41] an absence written by the job is reminded to the family once', async () => {
    setClock('2026-11-18 08:00');
    for (const k of ['due1', 'due3', 'due4']) await inst.admin.post('/attendance/check-in', { studentId: st[k] });
    setClock('2026-11-18 14:00');
    await s.runJob(AttendanceProcessor, 'mark-absences', inst.id);
    setClock('2026-11-18 15:00');
    await reminders();
    setClock('2026-11-18 16:00');
    await reminders();
    const [n] = await waitFor(fam.absent, 'ATTENDANCE_ABSENT');
    expect(n.title).toBe('طالب absent غائب اليوم');
    expect(await settled(fam.absent, 'ATTENDANCE_ABSENT')).toHaveLength(1);
  });

  it('[NTF-42/43] installments due in 1 and 3 days are reminded; in 4 days not; an overdue one once', async () => {
    setClock('2026-11-18 10:00');
    for (const [k, start] of [['due1', '2026-11-19'], ['due3', '2026-11-21'], ['due4', '2026-11-22']] as const) {
      await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st[k])}/contract`, { grossAmount: 300_000, numberOfInstallments: 1, startDate: start });
    }
    await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st.absent)}/contract`, { grossAmount: 300_000, numberOfInstallments: 1, startDate: '2026-11-01' });
    await s.runJob(FeesProcessor, 'mark-overdue-installments', inst.id);
    await reminders();
    await reminders();
    const [d1] = await waitFor(fam.due1, 'INSTALLMENT_DUE');
    expect([d1.title, d1.body]).toEqual(['قسط يستحق قريباً', 'قسط طالب due1 بقيمة 300,000 ل.س يستحق في 2026/11/19']);
    await waitFor(fam.due3, 'INSTALLMENT_DUE');
    expect(await settled(fam.due4, 'INSTALLMENT_DUE')).toHaveLength(0);
    const [o] = await waitFor(fam.absent, 'INSTALLMENT_OVERDUE');
    expect([o.title, o.body]).toEqual(['قسط متأخر', 'قسط طالب absent بقيمة 300,000 ل.س كان مستحقاً في 2026/11/01']);
    expect(await settled(fam.absent, 'INSTALLMENT_OVERDUE')).toHaveLength(1);
  });

  it('[NTF-44] marks reminder: only the exam of 5 days ago with no mark at all', async () => {
    const items = await waitFor(rami, 'MARKS_REMINDER');
    expect(items.map((n) => n.body)).toEqual(['بلا علامات - التاسع - أ (2026/11/13)']);
  });

  describe('8.5 lesson reminder', () => {
    const lessonNotices = async () => (await settled(rami, 'LESSON_REMINDER')).map((n) => n.title).reverse();

    it('[NTF-50] 09:44: nothing yet (16 minutes before)', async () => {
      setClock('2026-11-18 09:44');
      await lessons();
      expect(await lessonNotices()).toEqual([]);
    });

    it('[NTF-51] 09:45: "in 15 minutes" with subject, section, room and time', async () => {
      setClock('2026-11-18 09:45');
      await lessons();
      const [n] = await waitFor(rami, 'LESSON_REMINDER');
      expect([n.title, n.body]).toEqual(['حصتك القادمة بعد 15 دقيقة', 'الرياضيات - التاسع - أ - قاعة 4، الساعة 10:00']);
    });

    it('[NTF-52/54] 09:50 and 10:00: no repeat, and nothing once the lesson started', async () => {
      setClock('2026-11-18 09:50');
      await lessons();
      setClock('2026-11-18 10:00');
      await lessons();
      expect(await lessonNotices()).toEqual(['حصتك القادمة بعد 15 دقيقة']);
    });

    it('[NTF-53] Arabic minutes: 12:07 -> "8 دقائق"; 12:59 -> "دقيقة واحدة"', async () => {
      setClock('2026-11-18 12:07');
      await lessons();
      setClock('2026-11-18 12:59');
      await lessons();
      expect(await lessonNotices()).toEqual(['حصتك القادمة بعد 15 دقيقة', 'حصتك القادمة بعد 8 دقائق', 'حصتك القادمة بعد دقيقة واحدة']);
    });

    it('[NTF-55] a closed section gets no lesson reminder', async () => {
      setClock('2026-11-20 09:00');
      await inst.admin.withContext({ branchId: inst.branchId, academicYearId: inst.yearId })
        .post('/closures', { scope: 'SECTION', sectionIds: [section], fromDate: '2026-11-25', toDate: '2026-11-25', reason: 'رحلة' });
      setClock('2026-11-25 09:50'); // a Wednesday again
      await lessons();
      expect(await lessonNotices()).toHaveLength(3);
    });

    it('[NTF-56] late at night the window would cross midnight: nothing', async () => {
      setClock('2026-11-18 23:50');
      expect(await lessons()).toBe(0);
    });
  });
});
