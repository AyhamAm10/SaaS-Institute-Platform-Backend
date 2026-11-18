import { Inject, Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { NotificationsService } from './notifications.service';
import { NotificationAudienceRepository } from './notification-audience.repository';
import { NotificationType as T } from './notification.types';
import { messages } from './notification.messages';

/**
 * Study events (exams, marks, timetable, closures, teaching assignments)
 * turned into notifications for students, their families and teachers.
 * Called after the domain action succeeded; never throws.
 */
@Injectable()
export class StudyNotificationEventsService {
  private readonly logger = new Logger(StudyNotificationEventsService.name);

  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(NotificationAudienceRepository) private readonly audience: NotificationAudienceRepository,
  ) {}

  /** A new exam: its students and families, and the subject teacher when someone else created it. */
  examCreated(e: {
    examId: number; sectionId: number; subjectId: number; sectionName: string;
    subjectName: string; title: string; examDate: string; teacherId: number | null;
  }) {
    return this.run('exam-created', async () => {
      const students = await this.audience.students(await this.audience.sectionStudentIds(e.sectionId, e.subjectId));
      for (const s of students) {
        await this.notifications.notify({
          type: T.EXAM_SCHEDULED,
          ...messages.examScheduled(s.fullName, e.subjectName, e.title, e.examDate),
          userIds: [...s.familyUserIds, ...(s.studentUserId ? [s.studentUserId] : [])],
          studentId: s.studentId,
          extra: { examId: e.examId },
          // Per student: two siblings in the section each get their notice
          dedupeKey: `exam:${e.examId}:${s.studentId}`,
        });
      }
      if (e.teacherId) {
        const teacherUser = (await this.audience.teacherUsers([e.teacherId])).get(e.teacherId);
        if (teacherUser && teacherUser !== RequestContext.getUserId()) {
          await this.notifications.notify({
            type: T.TEACHER_EXAM_CREATED,
            ...messages.teacherExamCreated(e.title, e.sectionName, e.examDate),
            userIds: [teacherUser],
            extra: { examId: e.examId, sectionId: e.sectionId },
            dedupeKey: `teacher-exam:${e.examId}`,
          });
        }
      }
    });
  }

  /** Marks entered: one notification per student, the first time only. */
  resultsEntered(e: {
    examId: number; title: string; subjectName: string; maxMark: number;
    results: { studentId: number; mark: number | null }[];
  }) {
    return this.run('results', async () => {
      const marks = new Map(e.results.map((r) => [r.studentId, r.mark]));
      const students = await this.audience.students([...marks.keys()]);
      for (const s of students) {
        await this.notifications.notify({
          type: T.EXAM_RESULT,
          ...messages.examResult(s.fullName, e.subjectName, e.title, marks.get(s.studentId) ?? null, e.maxMark),
          userIds: [...s.familyUserIds, ...(s.studentUserId ? [s.studentUserId] : [])],
          studentId: s.studentId,
          extra: { examId: e.examId },
          dedupeKey: `result:${e.examId}:${s.studentId}`,
        });
      }
    });
  }

  /** Timetable of a section changed: at most one notice per person, section and day. */
  timetableChanged(e: { sectionId: number; sectionName: string; teacherIds: number[]; date: string }) {
    return this.run('timetable', async () => {
      const students = await this.audience.students(await this.audience.sectionStudentIds(e.sectionId));
      for (const s of students) {
        await this.notifications.notify({
          type: T.TIMETABLE_CHANGED,
          ...messages.timetableChanged(e.sectionName),
          userIds: [...s.familyUserIds, ...(s.studentUserId ? [s.studentUserId] : [])],
          studentId: s.studentId,
          dedupeKey: `timetable:${e.sectionId}:${e.date}`,
        });
      }
      const teachers = await this.audience.teacherUsers(e.teacherIds);
      await this.notifications.notify({
        type: T.TIMETABLE_CHANGED,
        ...messages.teacherTimetableChanged(),
        userIds: [...teachers.values()],
        dedupeKey: `timetable-teacher:${e.date}`,
      });
    });
  }

  closureCreated(e: {
    closureId: number; reason: string; fromDate: string; toDate: string;
    branchId: number | null; sectionIds: number[];
  }) {
    return this.run('closure', async () => {
      const scope = e.sectionIds.length > 0 ? { sectionIds: e.sectionIds } : { branchId: e.branchId ?? undefined };
      const students = await this.audience.students(await this.audience.studentsIn(scope));
      const teachers = await this.audience.teacherUsers(await this.audience.teacherIdsIn(scope));
      const userIds = [
        ...students.flatMap((s) => [...s.familyUserIds, ...(s.studentUserId ? [s.studentUserId] : [])]),
        ...teachers.values(),
      ];
      await this.notifications.notify({
        type: T.CLOSURE,
        ...messages.closure(e.reason, e.fromDate, e.toDate),
        userIds,
        extra: { closureId: e.closureId },
        dedupeKey: `closure:${e.closureId}`,
      });
    });
  }

  teacherAssigned(e: { teacherId: number; sectionId: number; subjectId: number; sectionName: string; subjectName: string }) {
    return this.run('assigned', async () => {
      const teacherUser = (await this.audience.teacherUsers([e.teacherId])).get(e.teacherId);
      if (!teacherUser) return;
      await this.notifications.notify({
        type: T.TEACHER_ASSIGNED,
        ...messages.teacherAssigned(e.subjectName, e.sectionName),
        userIds: [teacherUser],
        extra: { sectionId: e.sectionId },
        dedupeKey: `assign:${e.sectionId}:${e.subjectId}:${e.teacherId}`,
      });
    });
  }

  private run(name: string, fn: () => Promise<void>): Promise<void> {
    return fn().catch((err: unknown) => this.logger.error(`${name} notification failed: ${String(err)}`));
  }
}
