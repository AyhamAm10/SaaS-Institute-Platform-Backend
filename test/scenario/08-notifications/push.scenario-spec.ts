/**
 * [T5] 8.6 push and devices. Plan: 08-notifications.md
 * The push job sends each stored notification to every device of its user:
 * web pushes link to the installed web app, Android ones carry no link.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { NotificationsProcessor } from '../../../src/modules/notifications/notifications.processor';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { waitFor } from '../support/notify';

describe('[T5] 8.6 push and devices', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let yazan: number;
  let family: Api;
  let familyUserId: number;
  let section: number;

  const pushAll = async (userId: number) => {
    const ids = (await s.prisma.notification.findMany({ where: { userId }, select: { id: true } })).map((n) => n.id);
    return s.runJob(NotificationsProcessor, 'send-push', inst.id, { notificationIds: ids });
  };

  beforeAll(async () => {
    setClock('2026-11-18 07:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الإشعارات الفورية');
    section = await inst.section({ name: 'التاسع - أ', academicBranchId: await inst.anyAcademicBranch() });
    const phone = uniquePhone();
    yazan = (await inst.student({ fullName: 'يزن الخطيب', sectionId: section, newFamily: { familyName: 'الخطيب', fatherName: 'محمد', phone } })).id;
    family = await signIn(s, phone);
    familyUserId = (await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, phone } })).id;
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[NTF-60/61] a web device gets a link to the parents web app and its icon; an Android device gets none', async () => {
    await family.post('/notifications/devices', { token: 'web-token-yazan-0001', platform: 'WEB', app: 'PARENTS' });
    await family.post('/notifications/devices', { token: 'android-token-yazan-0001', platform: 'ANDROID', app: 'PARENTS' });
    setClock('2026-11-18 08:05');
    await inst.admin.post('/attendance/check-in', { studentId: yazan });
    await waitFor(family, 'ATTENDANCE_ARRIVAL');
    s.push.clear();
    await pushAll(familyUserId);

    const web = s.push.sent.find((p) => p.target.token === 'web-token-yazan-0001')!;
    const android = s.push.sent.find((p) => p.target.token === 'android-token-yazan-0001')!;
    expect(web.target).toEqual({
      token: 'web-token-yazan-0001',
      webLink: `https://jilapi.ayhamashram.me/parents/attendance?studentId=${yazan}`,
      webIcon: 'https://jilapi.ayhamashram.me/parents/icon-192.png',
    });
    expect(android.target).toEqual({ token: 'android-token-yazan-0001' });
    expect(web.message.title).toBe('وصل يزن الخطيب إلى المعهد');
    expect(Object.values(web.message.data).every((v) => typeof v === 'string')).toBe(true);
    expect(web.message.data).toMatchObject({ type: 'ATTENDANCE_ARRIVAL', path: '/attendance', studentId: String(yazan) });
  });

  it('[NTF-62] a token Firebase reports as uninstalled is deleted', async () => {
    await family.post('/notifications/devices', { token: 'dead-token-yazan-0001', platform: 'ANDROID', app: 'PARENTS' });
    await pushAll(familyUserId);
    expect(await s.prisma.deviceToken.count({ where: { token: 'dead-token-yazan-0001' } })).toBe(0);
    expect(await s.prisma.deviceToken.count({ where: { userId: familyUserId } })).toBe(2);
  });

  it('[NTF-63] the same device signed in by another user now belongs to that user only', async () => {
    const phone = uniquePhone();
    await inst.student({ fullName: 'عمر العمر', sectionId: section, newFamily: { familyName: 'العمر', fatherName: 'أحمد', phone } });
    const other = await signIn(s, phone);
    await other.post('/notifications/devices', { token: 'web-token-yazan-0001', platform: 'WEB', app: 'PARENTS' });
    const row = await s.prisma.deviceToken.findUniqueOrThrow({ where: { token: 'web-token-yazan-0001' } });
    expect(row.userId).not.toBe(familyUserId);
  });

  it('[NTF-64] signing out removes the device', async () => {
    await family.del('/notifications/devices', { token: 'android-token-yazan-0001' });
    expect(await s.prisma.deviceToken.count({ where: { userId: familyUserId } })).toBe(0);
  });

  it('[NTF-65] a Firebase outage never breaks the action; the inbox still has the notice', async () => {
    await family.post('/notifications/devices', { token: 'android-token-yazan-0002', platform: 'ANDROID', app: 'PARENTS' });
    s.push.failing = true;
    try {
      setClock('2026-11-18 13:00');
      const out = await inst.admin.post('/attendance/check-out', { studentId: yazan, note: 'موعد' });
      expect(out.status).toBe('PRESENT');
      await waitFor(family, 'ATTENDANCE_EARLY_EXIT');
      await expect(pushAll(familyUserId)).rejects.toThrow('FCM unavailable');
    } finally {
      s.push.failing = false;
    }
    // the job is retried by the queue: the next attempt delivers
    await pushAll(familyUserId);
    expect(s.push.sent.some((p) => p.message.title === 'خروج مبكر: يزن الخطيب')).toBe(true);
  });
});
