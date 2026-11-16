import { Inject, Injectable } from '@nestjs/common';
import { shiftLocalDate } from '../../common/time/timezone';
import { ExamsService } from '../exams/exams.service';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { InstituteScheduleConfigService } from '../institute-schedule-config/institute-schedule-config.service';
import { TimetablesService } from '../timetables/timetables.service';
import { TeacherAccessService } from './teacher-access.service';
import { TeacherContextService } from './teacher-context.service';
import { lessonsOfDay } from './teacher-schedule';
import { ExamBrief, TeacherOverview } from './teacher-api.types';

/** Exams looked at: the next two weeks, and the last month for pending marks. */
const UPCOMING_DAYS = 14;
const PENDING_LOOKBACK_DAYS = 30;
const EXAMS_PAGE = 50;
const PENDING_CHECKS = 15;

type ExamRow = {
  id: number;
  title: string;
  examDate: Date;
  section: { id: number; name: string };
  subject: { id: number; name: string };
};

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

const brief = (e: ExamRow): ExamBrief => ({
  examId: e.id,
  title: e.title,
  date: ymd(e.examDate),
  sectionId: e.section.id,
  sectionName: e.section.name,
  subjectId: e.subject.id,
  subjectName: e.subject.name,
});

/**
 * "Today" of a teacher: lessons, upcoming exams and exams waiting for marks.
 * Attendance is NOT a teacher task (administration records it), so it is not here.
 * Counts come from the owning services; nothing is computed from a page of data.
 */
@Injectable()
export class TeacherOverviewService {
  constructor(
    @Inject(TeacherAccessService) private readonly access: TeacherAccessService,
    @Inject(TeacherContextService) private readonly context: TeacherContextService,
    @Inject(InstituteClockService) private readonly clock: InstituteClockService,
    @Inject(InstituteScheduleConfigService)
    private readonly schedule: InstituteScheduleConfigService,
    @Inject(TimetablesService) private readonly timetables: TimetablesService,
    @Inject(ExamsService) private readonly exams: ExamsService,
  ) {}

  async getOverview(): Promise<TeacherOverview> {
    const caller = await this.access.caller();
    const local = await this.clock.localParts();
    const yearId = await this.access.yearId();
    const [config, entries, exams] = await Promise.all([
      this.schedule.getConfig(),
      yearId === null
        ? []
        : this.timetables.getEntriesForReport(yearId, { teacherId: caller.teacherId }),
      this.examsOf(yearId, local.date),
    ]);
    const minutes = local.minutesOfDay;
    return {
      date: local.date,
      now: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      dayOfWeek: local.dayOfWeek,
      isWorkingDay: config.workingDays.includes(local.dayOfWeek),
      lessons: lessonsOfDay(entries, local.dayOfWeek),
      ...exams,
    };
  }

  /** Upcoming exams, and recent exams that still wait for marks (the server's `pending`). */
  private async examsOf(yearId: number | null, today: string) {
    if (yearId === null) return { upcomingExams: [], pendingMarks: [] };
    return this.context.runForYear(yearId, async () => {
      const page = (from: string, to: string) =>
        this.exams.findAll({ page: 1, limit: EXAMS_PAGE, from, to } as never);
      const [upcoming, recent] = await Promise.all([
        page(today, shiftLocalDate(today, UPCOMING_DAYS)),
        page(shiftLocalDate(today, -PENDING_LOOKBACK_DAYS), today),
      ]);
      const pending: (ExamBrief & { pending: number })[] = [];
      for (const e of (recent.data as ExamRow[]).slice(0, PENDING_CHECKS)) {
        const sheet = await this.exams.getResults(e.id);
        if (sheet.stats.pending > 0) {
          pending.push({ ...brief(e), pending: sheet.stats.pending });
        }
      }
      return {
        upcomingExams: (upcoming.data as ExamRow[])
          .filter((e) => ymd(e.examDate) >= today)
          .reverse()
          .map(brief),
        pendingMarks: pending,
      };
    });
  }
}
