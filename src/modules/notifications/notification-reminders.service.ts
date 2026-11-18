import { Inject, Injectable } from '@nestjs/common';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { shiftLocalDate } from '../../common/time/timezone';
import { NotificationRemindersRepository } from './notification-reminders.repository';
import { NotificationEventsService } from './notification-events.service';
import { NotificationsService } from './notifications.service';
import { NotificationAudienceRepository } from './notification-audience.repository';
import { NotificationType as T } from './notification.types';
import { messages } from './notification.messages';

/** Reminders run between these local hours only (no night-time pushes). */
export const REMINDER_HOURS = { from: 9, to: 20 } as const;
/** "Due soon" means within this many days. */
export const DUE_SOON_DAYS = 3;
/** Marks reminders look back this many days after the exam. */
const MARKS_LOOKBACK_DAYS = 14;

/**
 * Hourly per-institute reminders built from the current state: today's
 * absences, installments due soon or overdue, exams waiting for marks.
 * Each one is sent once (dedupe keys), so running every hour is safe.
 */
@Injectable()
export class NotificationRemindersService {
  constructor(
    @Inject(InstituteClockService) private readonly clock: InstituteClockService,
    @Inject(NotificationRemindersRepository) private readonly reminders: NotificationRemindersRepository,
    @Inject(NotificationEventsService) private readonly events: NotificationEventsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(NotificationAudienceRepository) private readonly audience: NotificationAudienceRepository,
  ) {}

  /** Returns how many reminder groups ran (0 outside the allowed hours). */
  async run(): Promise<number> {
    const local = await this.clock.localParts();
    const hour = Math.floor(local.minutesOfDay / 60);
    if (hour < REMINDER_HOURS.from || hour > REMINDER_HOURS.to) return 0;
    const today = local.date;

    await this.events.absences(await this.reminders.absentStudentIds(today), today);
    await this.events.installment('due', await this.reminders.installmentsDue(shiftLocalDate(today, 1), shiftLocalDate(today, DUE_SOON_DAYS)));
    await this.events.installment('overdue', await this.reminders.installmentsOverdue());
    await this.marksReminders(today);
    return 4;
  }

  private async marksReminders(today: string): Promise<void> {
    const exams = await this.reminders.examsWithoutMarks(shiftLocalDate(today, -MARKS_LOOKBACK_DAYS), shiftLocalDate(today, -1));
    for (const exam of exams) {
      const teacherId = await this.reminders.teacherOf(exam.sectionId, exam.subjectId);
      if (!teacherId) continue;
      const userId = (await this.audience.teacherUsers([teacherId])).get(teacherId);
      if (!userId) continue;
      await this.notifications.notify({
        type: T.MARKS_REMINDER,
        ...messages.marksReminder(exam.title, exam.sectionName, exam.examDate),
        userIds: [userId],
        extra: { examId: exam.examId, sectionId: exam.sectionId },
        dedupeKey: `marks:${exam.examId}`,
      });
    }
  }
}
