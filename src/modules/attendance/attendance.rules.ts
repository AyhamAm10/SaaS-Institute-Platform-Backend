import { AttendanceStatus } from '@prisma/client';
import { shiftLocalDate, timeToMinutes } from '../../common/time/timezone';

/**
 * Pure attendance rules (no I/O). Times of day are minutes since local
 * midnight in the institute time zone (InstituteClock).
 */

export interface AttendanceDayConfig {
  workingDays: number[];
  dayStartTime: string;
  dayEndTime: string;
  lateAfterMinutes: number;
  attendanceCloseTime: string | null;
}

export function isWorkingDay(
  config: AttendanceDayConfig,
  dayOfWeek: number,
): boolean {
  return config.workingDays.includes(dayOfWeek);
}

/** LATE when the check-in is after dayStartTime + lateAfterMinutes, else PRESENT. */
export function checkInStatus(
  config: AttendanceDayConfig,
  minutesOfDay: number,
): AttendanceStatus {
  const limit = timeToMinutes(config.dayStartTime) + config.lateAfterMinutes;
  return minutesOfDay > limit
    ? AttendanceStatus.LATE
    : AttendanceStatus.PRESENT;
}

/** Local time after which students without a check-in are marked ABSENT. */
export function closeMinutes(config: AttendanceDayConfig): number {
  return timeToMinutes(config.attendanceCloseTime ?? config.dayEndTime);
}

export interface DayCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
  notRecorded: number;
}

/** Counters of a day roster (students without a record are "not recorded"). */
export function countDay(statuses: (AttendanceStatus | null)[]): DayCounts {
  const counts: DayCounts = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    notRecorded: 0,
  };
  for (const status of statuses) {
    if (status === AttendanceStatus.PRESENT) counts.present++;
    else if (status === AttendanceStatus.LATE) counts.late++;
    else if (status === AttendanceStatus.ABSENT) counts.absent++;
    else if (status === AttendanceStatus.EXCUSED) counts.excused++;
    else counts.notRecorded++;
  }
  return counts;
}

/** Share of attended (PRESENT + LATE) over a base, in % with one decimal; null without a base. */
export function attendanceRate(attended: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.round((attended / base) * 1000) / 10;
}

/** Day of week (0 = Sunday) of a local `YYYY-MM-DD` date. */
export function dayOfWeekOf(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

/** The last `count` working days up to `today` (inclusive), oldest first. */
export function lastWorkingDays(
  today: string,
  count: number,
  workingDays: number[],
): string[] {
  const days: string[] = [];
  // Bounded lookback: a config without working days returns an empty series
  for (let i = 0; i < count * 7 && days.length < count; i++) {
    const date = shiftLocalDate(today, -i);
    if (workingDays.includes(dayOfWeekOf(date))) days.unshift(date);
  }
  return days;
}

export interface DayStatusCount {
  date: string;
  status: AttendanceStatus;
  count: number;
}

export interface AttendanceDayPoint {
  date: string;
  dayOfWeek: number;
  attended: number;
  recorded: number;
  /** attended ÷ recorded (records of that day), null when nothing recorded. */
  rate: number | null;
}

/** One point per requested day from `groupBy(date, status)` rows. */
export function attendanceSeries(
  rows: DayStatusCount[],
  days: string[],
): AttendanceDayPoint[] {
  return days.map((date) => {
    const ofDay = rows.filter((r) => r.date === date);
    const recorded = ofDay.reduce((sum, r) => sum + r.count, 0);
    const attended = ofDay
      .filter(
        (r) =>
          r.status === AttendanceStatus.PRESENT ||
          r.status === AttendanceStatus.LATE,
      )
      .reduce((sum, r) => sum + r.count, 0);
    return {
      date,
      dayOfWeek: dayOfWeekOf(date),
      attended,
      recorded,
      rate: attendanceRate(attended, recorded),
    };
  });
}
