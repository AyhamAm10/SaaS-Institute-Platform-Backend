import { Inject, Injectable } from '@nestjs/common';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { closedGroupsOn } from '../closures/closures.rules';
import { LessonRemindersRepository } from './lesson-reminders.repository';
import { NotificationAudienceRepository } from './notification-audience.repository';
import { NotificationsService } from './notifications.service';
import { NotificationType as T } from './notification.types';
import { messages } from './notification.messages';

/** How long before a lesson the teacher is reminded. */
export const LESSON_REMINDER_MINUTES = 15;

const hm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const toMinutes = (value: string): number => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

/**
 * "Your next lesson is in N minutes" for teachers. Runs every 5 minutes per
 * institute: lessons of the current year starting in the next 15 minutes
 * (local time), skipping sections closed today. One reminder per lesson and
 * day (dedupe key), so overlapping runs never repeat it.
 */
@Injectable()
export class LessonRemindersService {
  constructor(
    @Inject(InstituteClockService) private readonly clock: InstituteClockService,
    @Inject(LessonRemindersRepository) private readonly lessons: LessonRemindersRepository,
    @Inject(NotificationAudienceRepository) private readonly audience: NotificationAudienceRepository,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /** Returns how many lessons were announced in this run. */
  async run(): Promise<number> {
    const local = await this.clock.localParts();
    const now = local.minutesOfDay;
    const until = now + LESSON_REMINDER_MINUTES;
    if (until >= 24 * 60) return 0;
    const rows = await this.lessons.lessonsStartingBetween(local.dayOfWeek, hm(now), hm(until));
    if (rows.length === 0) return 0;

    const closed = closedGroupsOn(await this.lessons.closuresOn(local.date), local.date);
    if (closed.all) return 0;
    const open = rows.filter((r) => !closed.branchIds.includes(r.branchId) && !closed.sectionIds.includes(r.sectionId));
    const users = await this.audience.teacherUsers([...new Set(open.map((r) => r.teacherId))]);

    let sent = 0;
    for (const r of open) {
      const userId = users.get(r.teacherId);
      if (!userId) continue;
      const minutes = Math.max(1, toMinutes(r.startTime) - now);
      await this.notifications.notify({
        type: T.LESSON_REMINDER,
        ...messages.lessonSoon(minutes, r.subjectName, r.sectionName, r.roomName, r.startTime),
        userIds: [userId],
        extra: { sectionId: r.sectionId, entryId: r.entryId },
        dedupeKey: `lesson:${r.entryId}:${local.date}`,
      });
      sent++;
    }
    return sent;
  }
}
