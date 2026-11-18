import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationAudienceRepository, StudentAudience } from './notification-audience.repository';
import { NotificationType as T, NotifyInput } from './notification.types';
import { Message, messages, moneyText } from './notification.messages';

/** Who of a student's circle hears about an event. */
type Circle = 'family' | 'familyAndStudent';

/**
 * Domain events of the students' life (attendance, finance, notes) turned into
 * notifications. Domain services call these AFTER their own work succeeded;
 * every method swallows its errors (`run`) so a notification can never break
 * the action. Study events (exams, timetable, closures) are in
 * StudyNotificationEventsService.
 */
@Injectable()
export class NotificationEventsService {
  private readonly logger = new Logger(NotificationEventsService.name);

  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(NotificationAudienceRepository) private readonly audience: NotificationAudienceRepository,
  ) {}

  /** Check-in of today: arrival (family) or late (family + student). */
  attendanceCheckIn(e: { studentId: number; late: boolean; time: string; date: string }) {
    return this.run('check-in', async () => {
      const [s] = await this.audience.students([e.studentId]);
      if (!s) return;
      await this.toStudent(s, e.late ? 'familyAndStudent' : 'family', {
        type: e.late ? T.ATTENDANCE_LATE : T.ATTENDANCE_ARRIVAL,
        ...(e.late ? messages.late(person(s), e.time) : messages.arrival(person(s), e.time)),
        dedupeKey: `att-in:${e.studentId}:${e.date}`,
      });
    });
  }

  earlyExit(e: { studentId: number; time: string; date: string; reason: string | null }) {
    return this.run('early-exit', async () => {
      const [s] = await this.audience.students([e.studentId]);
      if (!s) return;
      await this.toStudent(s, 'familyAndStudent', {
        type: T.ATTENDANCE_EARLY_EXIT,
        ...messages.earlyExit(person(s), e.time, e.reason),
        dedupeKey: `att-out:${e.studentId}:${e.date}`,
      });
    });
  }

  excused(e: { studentId: number; date: string; note: string | null }) {
    return this.run('excused', async () => {
      const [s] = await this.audience.students([e.studentId]);
      if (!s) return;
      await this.toStudent(s, 'family', {
        type: T.ATTENDANCE_EXCUSED,
        ...messages.excused(person(s), e.date, e.note),
        dedupeKey: `att-excused:${e.studentId}:${e.date}`,
      });
    });
  }

  /** Absences found by the hourly job (once per student and day). */
  async absences(studentIds: number[], date: string): Promise<void> {
    const students = await this.audience.students(studentIds);
    for (const s of students) {
      await this.toStudent(s, 'familyAndStudent', {
        type: T.ATTENDANCE_ABSENT,
        ...messages.absent(person(s), date),
        dedupeKey: `att-absent:${s.studentId}:${date}`,
      });
    }
  }

  paymentReceived(e: { paymentId: number; studentId: number; receiptNumber: number; amount: number; currency: string }) {
    return this.run('payment', async () => {
      const [s] = await this.audience.students([e.studentId]);
      if (!s) return;
      await this.toStudent(s, 'family', {
        type: T.PAYMENT_RECEIVED,
        ...messages.paymentReceived(s.fullName, e.receiptNumber, moneyText(e.amount, e.currency)),
        extra: { paymentId: e.paymentId },
        dedupeKey: `payment:${e.paymentId}`,
      });
    });
  }

  /** Installment reminders from the hourly job. */
  async installment(
    kind: 'due' | 'overdue',
    rows: { installmentId: number; studentId: number; amount: number; currency: string; dueDate: string }[],
  ): Promise<void> {
    const students = new Map((await this.audience.students(rows.map((r) => r.studentId))).map((s) => [s.studentId, s]));
    for (const r of rows) {
      const s = students.get(r.studentId);
      if (!s) continue;
      const amount = moneyText(r.amount, r.currency);
      await this.toStudent(s, 'family', {
        type: kind === 'due' ? T.INSTALLMENT_DUE : T.INSTALLMENT_OVERDUE,
        ...(kind === 'due'
          ? messages.installmentDue(s.fullName, amount, r.dueDate)
          : messages.installmentOverdue(s.fullName, amount, r.dueDate)),
        dedupeKey: `${kind}:${r.installmentId}`,
      });
    }
  }

  studentNote(e: { noteId: number; studentId: number; body: string }) {
    return this.run('note', async () => {
      const [s] = await this.audience.students([e.studentId]);
      if (!s) return;
      await this.toStudent(s, 'family', {
        type: T.STUDENT_NOTE,
        ...messages.studentNote(s.fullName, e.body),
        extra: { noteId: e.noteId },
        dedupeKey: `note:${e.noteId}`,
      });
    });
  }

  private toStudent(
    s: StudentAudience,
    circle: Circle,
    m: Message & Pick<NotifyInput, 'type' | 'dedupeKey' | 'extra'>,
  ) {
    const userIds = [...s.familyUserIds, ...(circle === 'familyAndStudent' && s.studentUserId ? [s.studentUserId] : [])];
    return this.notifications.notify({ ...m, userIds, studentId: s.studentId });
  }

  /** Runs an event handler in the background of the request; logs, never throws. */
  private run(name: string, fn: () => Promise<void>): Promise<void> {
    return fn().catch((err: unknown) => this.logger.error(`${name} notification failed: ${String(err)}`));
  }
}

const person = (s: StudentAudience) => ({ name: s.fullName, female: s.female });
