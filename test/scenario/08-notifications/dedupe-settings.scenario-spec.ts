/**
 * [T5] 8.2 each event once, 8.3 category switches. Plan: 08-notifications.md
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { RequestContext } from '../../../src/context/request-context';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { settled, waitFor } from '../support/notify';

describe('[T5] 8.2-8.3 dedupe and settings', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let section: number;
  let subject: number;
  let teacherId: number;
  let yazan: number;
  let family: Api;
  let familyUserId: number;
  let contractId: number;

  beforeAll(async () => {
    setClock('2026-11-18 07:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'التكرار');
    const ab = await inst.anyAcademicBranch();
    subject = await inst.subject('الرياضيات');
    const t = await inst.admin.post('/teachers', { fullName: 'أ. رامي', phone: uniquePhone(), branchIds: [inst.branchId], qualifications: [{ academicBranchId: ab, subjectId: subject }] });
    teacherId = t.id ?? t.teacher?.id;
    section = await inst.section({ name: 'التاسع - أ', academicBranchId: ab });
    await inst.admin.post(`/sections/${section}/subjects`, { subjectId: subject, weeklyPeriods: 5, teacherId });
    const phone = uniquePhone();
    yazan = (await inst.student({ fullName: 'يزن الخطيب', sectionId: section, newFamily: { familyName: 'الخطيب', fatherName: 'محمد', phone } })).id;
    family = await signIn(s, phone);
    familyUserId = (await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, phone } })).id;
    contractId = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(yazan)}/contract`, { grossAmount: 1_000_000, numberOfInstallments: 2 })).id;
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[NTF-20] correcting a check-in does not announce the arrival again', async () => {
    setClock('2026-11-18 08:05');
    const row = await inst.admin.post('/attendance/check-in', { studentId: yazan });
    await waitFor(family, 'ATTENDANCE_ARRIVAL');
    await inst.admin.patch(`/attendance/${row.id}`, { checkInAt: '2026-11-18T05:01:00.000Z' });
    expect(await settled(family, 'ATTENDANCE_ARRIVAL')).toHaveLength(1);
  });

  it('[NTF-21] saving the same marks three times announces the result once', async () => {
    const exam = await inst.admin.post('/exams', { sectionId: section, subjectId: subject, title: 'مذاكرة', examDate: '2026-11-18', maxMark: 20, passMark: 10 });
    for (const mark of [15, 16, 17]) await inst.admin.put(`/exams/${exam.id}/results`, { results: [{ studentId: yazan, mark }] });
    expect(await settled(family, 'EXAM_RESULT')).toHaveLength(1);
  });

  it('[NTF-22] two timetable edits the same day: one notice; the next day: a new one', async () => {
    const path = `/academic-years/${inst.yearId}/sections/${section}/timetable/entries`;
    await inst.admin.post(path, { subjectId: subject, teacherId, dayOfWeek: 0, startTime: '08:00', endTime: '08:45' });
    await inst.admin.post(path, { subjectId: subject, teacherId, dayOfWeek: 1, startTime: '08:00', endTime: '08:45' });
    expect(await waitFor(family, 'TIMETABLE_CHANGED')).toHaveLength(1);
    expect(await settled(family, 'TIMETABLE_CHANGED')).toHaveLength(1);
    setClock('2026-11-19 09:00');
    await inst.admin.post(path, { subjectId: subject, teacherId, dayOfWeek: 2, startTime: '08:00', endTime: '08:45' });
    expect(await waitFor(family, 'TIMETABLE_CHANGED', 2)).toHaveLength(2);
  });

  it('[NTF-24] the same event raised 5 times at once is stored once (unique key + skip duplicates)', async () => {
    const service = s.app.get(NotificationsService, { strict: false });
    const send = () => service.notify({ userIds: [familyUserId], type: 'CLOSURE', title: 'عطلة', body: 'يوم', dedupeKey: 'scenario-race-1' });
    await RequestContext.run({ userId: 0, instituteId: inst.id, role: 'SYSTEM' } as never, () => Promise.all([send(), send(), send(), send(), send()]));
    expect(await s.prisma.notification.count({ where: { userId: familyUserId, dedupeKey: 'scenario-race-1' } })).toBe(1);
  });

  it('[NTF-30] a new user has every category on', async () => {
    const settings = await family.get('/notifications/settings');
    expect(settings.categories).toEqual([
      { key: 'ATTENDANCE', enabled: true }, { key: 'FINANCE', enabled: true }, { key: 'STUDY', enabled: true },
      { key: 'NOTES', enabled: true }, { key: 'GENERAL', enabled: true },
    ]);
  });

  it('[NTF-31] FINANCE off: a payment leaves no trace (no inbox row, no push); back on: the next one arrives', async () => {
    await family.put('/notifications/settings', { disabledCategories: ['FINANCE'] });
    await inst.admin.post(`/contracts/${contractId}/payments`, { amount: 100_000 });
    expect(await settled(family, 'PAYMENT_RECEIVED')).toHaveLength(0);
    expect(await s.prisma.notification.count({ where: { userId: familyUserId, type: 'PAYMENT_RECEIVED' } })).toBe(0);
    await family.put('/notifications/settings', { disabledCategories: [] });
    await inst.admin.post(`/contracts/${contractId}/payments`, { amount: 100_000 });
    expect(await waitFor(family, 'PAYMENT_RECEIVED')).toHaveLength(1);
  });

  it('[NTF-32] an unknown category is refused', async () => {
    await family.fails('put', '/notifications/settings', 400, { disabledCategories: ['NOPE'] });
  });

  it('[NTF-66] unread count, read one, read all; another user\'s notification cannot be read', async () => {
    const unread = (await family.get('/notifications/unread-count')).unread;
    const all = (await family.get('/notifications?page=1&limit=100')).data;
    expect(unread).toBe(all.length);
    await family.post(`/notifications/${all[0].id}/read`);
    expect((await family.get('/notifications/unread-count')).unread).toBe(unread - 1);
    const strangerPhone = uniquePhone();
    await inst.student({ fullName: 'طالب آخر', sectionId: section, newFamily: { familyName: 'آخر', fatherName: 'أب', phone: strangerPhone } });
    const stranger = await signIn(s, strangerPhone);
    const res = await stranger.post(`/notifications/${all[1].id}/read`);
    expect(res.updated).toBe(0);
    expect((await s.prisma.notification.findUniqueOrThrow({ where: { id: all[1].id } })).readAt).toBeNull();
    await family.post('/notifications/read-all');
    expect((await family.get('/notifications/unread-count')).unread).toBe(0);
  });
});
