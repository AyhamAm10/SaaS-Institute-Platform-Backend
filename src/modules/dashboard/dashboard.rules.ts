import { AttendanceStatus } from '@prisma/client';
import {
  attendanceRate,
  countDay,
  DayCounts,
} from '../attendance/attendance.rules';
import type { SectionOverviewRow } from './dto/dashboard-overview.dto';

/**
 * Pure composition of the dashboard numbers (no I/O). The domain services
 * produce the raw data; this only joins it.
 */

const attended = (status: AttendanceStatus) =>
  status === AttendanceStatus.PRESENT || status === AttendanceStatus.LATE;

/**
 * Today's counters over the ACTIVE students only (records of other students
 * are ignored); students without a record are "not recorded". The rate is
 * null on a day off or without active students.
 */
export function todayAttendance(
  activeStudentIds: number[],
  records: { studentId: number; status: AttendanceStatus }[],
  isWorkingDay: boolean,
): DayCounts & { rate: number | null } {
  const statusOf = new Map(records.map((r) => [r.studentId, r.status]));
  const counts = countDay(
    activeStudentIds.map((id) => statusOf.get(id) ?? null),
  );
  return {
    ...counts,
    rate: isWorkingDay
      ? attendanceRate(counts.present + counts.late, activeStudentIds.length)
      : null,
  };
}

/** One row per section: active students, attended today, average percentage. */
export function sectionRows(
  sections: { id: number; name: string }[],
  enrollments: { studentId: number; sectionId: number }[],
  records: { studentId: number; status: AttendanceStatus }[],
  averages: Map<number, number | null>,
): SectionOverviewRow[] {
  const attendedIds = new Set(
    records.filter((r) => attended(r.status)).map((r) => r.studentId),
  );
  return sections.map((section) => {
    const ofSection = enrollments.filter((e) => e.sectionId === section.id);
    return {
      id: section.id,
      name: section.name,
      students: ofSection.length,
      attendedToday: ofSection.filter((e) => attendedIds.has(e.studentId))
        .length,
      averagePercent: averages.get(section.id) ?? null,
    };
  });
}
