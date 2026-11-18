import { jest } from '@jest/globals';
import { LessonRemindersService, LESSON_REMINDER_MINUTES } from './lesson-reminders.service';
import { minutesText } from './notification.messages';

const lesson = (over: Record<string, unknown> = {}) => ({
  entryId: 7, teacherId: 4, startTime: '10:00', subjectName: 'الرياضيات',
  sectionId: 3, sectionName: 'التاسع - أ', branchId: 1, roomName: 'قاعة 4', ...over,
});

describe('LessonRemindersService', () => {
  const build = (minutesOfDay: number, rows = [lesson()], closures: unknown[] = []) => {
    const lessons = {
      lessonsStartingBetween: jest.fn<any>().mockResolvedValue(rows),
      closuresOn: jest.fn<any>().mockResolvedValue(closures),
    };
    const notify = jest.fn<any>();
    const service = new LessonRemindersService(
      { localParts: async () => ({ date: '2026-11-18', minutesOfDay, dayOfWeek: 3 }) } as never,
      lessons as never,
      { teacherUsers: async () => new Map([[4, 40]]) } as never,
      { notify } as never,
    );
    return { service, lessons, notify };
  };

  it('asks for lessons of today starting within the next 15 minutes', async () => {
    const { service, lessons } = build(9 * 60 + 47);
    await service.run();
    expect(LESSON_REMINDER_MINUTES).toBe(15);
    expect(lessons.lessonsStartingBetween).toHaveBeenCalledWith(3, '09:47', '10:02');
  });

  it('reminds the teacher once per lesson and day with the minutes left', async () => {
    const { service, notify } = build(9 * 60 + 47);
    await expect(service.run()).resolves.toBe(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: 'LESSON_REMINDER',
      userIds: [40],
      title: 'حصتك القادمة بعد 13 دقيقة',
      body: 'الرياضيات - التاسع - أ - قاعة 4، الساعة 10:00',
      dedupeKey: 'lesson:7:2026-11-18',
      extra: { sectionId: 3, entryId: 7 },
    });
  });

  it('skips lessons of a closed section or branch, and everything on an institute closure', async () => {
    const section = { id: 1, scope: 'SECTION', branchId: null, fromDate: '2026-11-18', toDate: '2026-11-18', reason: 'x', sectionIds: [3] };
    const one = build(9 * 60 + 47, [lesson(), lesson({ entryId: 8, sectionId: 5 })], [section]);
    await one.service.run();
    expect(one.notify.mock.calls.map((c) => (c[0] as { dedupeKey: string }).dedupeKey)).toEqual(['lesson:8:2026-11-18']);

    const all = build(9 * 60 + 47, [lesson()], [{ ...section, scope: 'INSTITUTE', sectionIds: [] }]);
    await expect(all.service.run()).resolves.toBe(0);
  });

  it('does nothing late at night (the window would cross midnight) or without lessons', async () => {
    const late = build(23 * 60 + 50);
    await expect(late.service.run()).resolves.toBe(0);
    expect(late.lessons.lessonsStartingBetween).not.toHaveBeenCalled();
    const empty = build(9 * 60, []);
    await expect(empty.service.run()).resolves.toBe(0);
    expect(empty.lessons.closuresOn).not.toHaveBeenCalled();
  });

  it('words the minutes in proper Arabic', () => {
    expect(minutesText(1)).toBe('دقيقة واحدة');
    expect(minutesText(2)).toBe('دقيقتين');
    expect(minutesText(10)).toBe('10 دقائق');
    expect(minutesText(15)).toBe('15 دقيقة');
  });
});
