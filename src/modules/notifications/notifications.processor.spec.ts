import { jest } from '@jest/globals';
import { NotificationsProcessor, pushOf } from './notifications.processor';
import { NotificationRemindersService, REMINDER_HOURS } from './notification-reminders.service';
import { JobNames } from '../../infrastructure/queue/queue-names';

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 11,
    userId: 10,
    type: 'ATTENDANCE_ARRIVAL',
    title: 'وصل يزن',
    body: 'b',
    studentId: 1,
    data: { type: 'ATTENDANCE_ARRIVAL', path: '/attendance', studentId: 1 },
    ...over,
  }) as never;

describe('pushOf', () => {
  it('links a web push to the installed web app and its icon', () => {
    const { target, payload } = pushOf(row(), { token: 't', app: 'PARENTS', platform: 'WEB' });
    expect(target.webLink).toBe('https://jilapi.ayhamashram.me/parents/attendance?studentId=1');
    expect(target.webIcon).toBe('https://jilapi.ayhamashram.me/parents/icon-192.png');
    expect(payload).toMatchObject({ notificationId: '11', path: '/attendance', studentId: '1' });
  });

  it('sends no link to a native device and keeps data as strings', () => {
    const { target, payload } = pushOf(row({ data: null, studentId: null }), { token: 't', app: 'TEACHER', platform: 'ANDROID' });
    expect(target).toEqual({ token: 't' });
    expect(payload.path).toBe('/notifications');
  });
});

describe('NotificationsProcessor', () => {
  it('pushes each row to its user devices and removes dead tokens', async () => {
    const repo = { findByIds: jest.fn<any>().mockResolvedValue([row(), row({ id: 12, userId: 99 })]) };
    const devices = {
      findForUsers: jest.fn<any>().mockResolvedValue([
        { userId: 10, token: 'a', app: 'PARENTS', platform: 'ANDROID' },
        { userId: 10, token: 'dead', app: 'PARENTS', platform: 'WEB' },
      ]),
      removeTokens: jest.fn<any>(),
    };
    const sender = {
      send: jest.fn<any>().mockImplementation(async (_m: unknown, [t]: { token: string }[]) =>
        t.token === 'dead' ? { sent: 0, deadTokens: ['dead'] } : { sent: 1, deadTokens: [] },
      ),
    };
    const processor = new NotificationsProcessor(repo as never, devices as never, sender as never, {} as never);
    const sent = await (processor as unknown as { handle: (j: unknown) => Promise<number> }).handle({
      name: JobNames.sendPush,
      data: { notificationIds: [11, 12], instituteId: 3 },
    });
    expect(sent).toBe(1);
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(devices.removeTokens).toHaveBeenCalledWith(['dead']);
  });
});

describe('NotificationRemindersService', () => {
  const build = (minutesOfDay: number) => {
    const reminders = {
      absentStudentIds: jest.fn<any>().mockResolvedValue([1]),
      installmentsDue: jest.fn<any>().mockResolvedValue([]),
      installmentsOverdue: jest.fn<any>().mockResolvedValue([]),
      examsWithoutMarks: jest.fn<any>().mockResolvedValue([
        { examId: 5, title: 'مذاكرة', examDate: '2026-11-10', sectionId: 2, subjectId: 3, sectionName: 'س' },
      ]),
      teacherOf: jest.fn<any>().mockResolvedValue(4),
    };
    const events = { absences: jest.fn<any>(), installment: jest.fn<any>() };
    const notify = jest.fn<any>();
    const service = new NotificationRemindersService(
      { localParts: async () => ({ date: '2026-11-17', minutesOfDay }) } as never,
      reminders as never,
      events as never,
      { notify } as never,
      { teacherUsers: async () => new Map([[4, 40]]) } as never,
    );
    return { service, events, reminders, notify };
  };

  it('stays quiet at night', async () => {
    const { service, events } = build((REMINDER_HOURS.from - 1) * 60 + 59);
    await expect(service.run()).resolves.toBe(0);
    expect(events.absences).not.toHaveBeenCalled();
  });

  it('sends absences, installments and marks reminders during the day', async () => {
    const { service, events, reminders, notify } = build(10 * 60);
    await service.run();
    expect(events.absences).toHaveBeenCalledWith([1], '2026-11-17');
    expect(reminders.installmentsDue).toHaveBeenCalledWith('2026-11-18', '2026-11-20');
    expect(notify.mock.calls[0][0]).toMatchObject({ type: 'MARKS_REMINDER', userIds: [40], dedupeKey: 'marks:5' });
  });
});
