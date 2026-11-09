import { ReportTimetableEntry } from '../timetables/timetable-entry.repository';
import { MobileLesson, MobileTimetable, MobileWeekday } from './mobile-api.types';

const WEEKDAYS: MobileWeekday[] = [
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

const byStart = (a: ReportTimetableEntry, b: ReportTimetableEntry): number =>
  a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime);

/** Working days only (0 = Sunday), each with its slots sorted by start time. */
export function buildTimetable(
  entries: ReportTimetableEntry[],
  workingDays: number[],
): MobileTimetable {
  return {
    days: WEEK_ORDER.filter((d) => workingDays.includes(d)).map((d) => ({
      weekday: WEEKDAYS[d],
      slots: entries
        .filter((e) => e.dayOfWeek === d)
        .sort(byStart)
        .map((e) => ({
          startTime: e.startTime,
          endTime: e.endTime,
          subject: e.subject.name,
          teacher: e.teacher?.user?.fullName ?? null,
          room: e.room?.name ?? null,
        })),
    })),
  };
}

/** Lessons of one weekday (0 = Sunday) for the "today" card. */
export function lessonsOfDay(
  entries: ReportTimetableEntry[],
  dayOfWeek: number,
): MobileLesson[] {
  return entries
    .filter((e) => e.dayOfWeek === dayOfWeek)
    .sort(byStart)
    .map((e) => ({
      id: e.id,
      subject: e.subject.name,
      startTime: e.startTime,
      endTime: e.endTime,
      room: e.room?.name ?? null,
      teacher: e.teacher?.user?.fullName ?? null,
    }));
}
