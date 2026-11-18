import { jest } from '@jest/globals';
import { RequestContext } from '../../context/request-context';
import { NotificationsService } from './notifications.service';
import { NotificationType as T } from './notification.types';

const asUser = <R>(fn: () => R): R =>
  RequestContext.run({ userId: 7, instituteId: 3, role: 'FAMILY' } as never, fn);

describe('NotificationsService', () => {
  let repo: Record<string, jest.Mock<any>>;
  let devices: Record<string, jest.Mock<any>>;
  let settings: Record<string, jest.Mock<any>>;
  let queue: { add: jest.Mock<any> };
  let service: NotificationsService;

  beforeEach(() => {
    repo = {
      createIfNew: jest.fn<any>().mockImplementation(async (rows: { userId: number }[]) =>
        rows.map((r, i) => ({ id: i + 1, ...r })),
      ),
      findPage: jest.fn<any>().mockResolvedValue({ data: [], total: 0, unread: 0 }),
      countUnread: jest.fn<any>().mockResolvedValue(2),
      markRead: jest.fn<any>().mockResolvedValue(1),
    };
    devices = { upsert: jest.fn<any>(), removeForUser: jest.fn<any>().mockResolvedValue(1) };
    settings = {
      disabledForUsers: jest.fn<any>().mockResolvedValue(new Map()),
      disabledFor: jest.fn<any>().mockResolvedValue([]),
      save: jest.fn<any>(),
    };
    queue = { add: jest.fn<any>() };
    service = new NotificationsService(repo as never, devices as never, settings as never, queue as never);
  });

  const input = {
    userIds: [1, 2, 2],
    type: T.ATTENDANCE_ARRIVAL,
    title: 'وصل يزن',
    body: 'سُجّل الحضور',
    studentId: 5,
    dedupeKey: 'att-in:5:2026-11-17',
  };

  it('stores one row per distinct user with the app path and queues one push job', async () => {
    const created = await asUser(() => service.notify(input));
    expect(created).toHaveLength(2);
    const rows = repo.createIfNew.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows.map((r) => r.userId)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      dedupeKey: 'att-in:5:2026-11-17',
      studentId: 5,
      data: { type: T.ATTENDANCE_ARRIVAL, path: '/attendance', studentId: 5 },
    });
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][1]).toMatchObject({ notificationIds: [1, 2], instituteId: 3 });
  });

  it('skips users who turned the category off', async () => {
    settings.disabledForUsers.mockResolvedValue(new Map([[2, ['ATTENDANCE']]]));
    await asUser(() => service.notify(input));
    expect((repo.createIfNew.mock.calls[0][0] as unknown[]).length).toBe(1);
  });

  it('queues nothing when every row was already sent (dedupe)', async () => {
    repo.createIfNew.mockResolvedValue([]);
    await asUser(() => service.notify(input));
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('never throws to the caller', async () => {
    repo.createIfNew.mockRejectedValue(new Error('db down'));
    await expect(asUser(() => service.notify(input))).resolves.toEqual([]);
  });

  it('reports every category enabled by default and saves only known ones', async () => {
    const view = await asUser(() => service.getSettings());
    expect(view.categories.every((c) => c.enabled)).toBe(true);
    await asUser(() => service.saveSettings(['FINANCE', 'NOPE' as never]));
    expect(settings.save).toHaveBeenCalledWith(7, ['FINANCE']);
  });

  it('works on the signed-in user only', async () => {
    await asUser(() => service.registerDevice('tok', 'WEB', 'PARENTS'));
    expect(devices.upsert).toHaveBeenCalledWith({ userId: 7, token: 'tok', platform: 'WEB', app: 'PARENTS' });
    await asUser(() => service.markRead());
    expect(repo.markRead).toHaveBeenCalledWith(7, undefined);
    await expect(asUser(() => service.unreadCount())).resolves.toEqual({ unread: 2 });
  });
});
