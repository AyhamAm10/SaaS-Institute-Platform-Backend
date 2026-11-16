import { ReportTimetableEntry } from '../timetables/timetable-entry.repository';
import { TeacherLesson, TeacherTimetable, TeacherWeekday } from './teacher-api.types';

const WEEKDAYS: TeacherWeekday[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

/** The institute week starts on Saturday (schedule config default). */
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

const byStart = (a: TeacherLesson, b: TeacherLesson): number =>
  a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime);

export function toLesson(e: ReportTimetableEntry): TeacherLesson {
  return {
    id: e.id,
    startTime: e.startTime,
    endTime: e.endTime,
    periodNumber: e.periodNumber ?? null,
    sectionId: e.timetable.section.id,
    sectionName: e.timetable.section.name,
    subjectId: e.subject.id,
    subjectName: e.subject.name,
    room: e.room?.name ?? null,
  };
}

/** Lessons of one weekday (0 = Sunday), sorted by time. */
export function lessonsOfDay(entries: ReportTimetableEntry[], dayOfWeek: number): TeacherLesson[] {
  return entries.filter((e) => e.dayOfWeek === dayOfWeek).map(toLesson).sort(byStart);
}

/** Working days only, in institute order, each with its sorted lessons. */
export function buildTimetable(
  entries: ReportTimetableEntry[],
  workingDays: number[],
  breaks: TeacherTimetable['breaks'],
  academicYearId: number | null,
): TeacherTimetable {
  return {
    academicYearId,
    breaks,
    days: WEEK_ORDER.filter((d) => workingDays.includes(d)).map((d) => ({
      dayOfWeek: d,
      weekday: WEEKDAYS[d],
      lessons: lessonsOfDay(entries, d),
    })),
  };
}
