import { Currency } from '@prisma/client';
import type {
  AttendanceDayPoint,
  DayCounts,
} from '../../attendance/attendance.rules';
import type { FinanceOverviewRow } from '../../fees/fees-reports.service';

/** One section of the dashboard performance table. */
export interface SectionOverviewRow {
  id: number;
  name: string;
  students: number;
  /** Students of the section recorded PRESENT or LATE today. */
  attendedToday: number;
  /** Average exam percentage of the section in the year (null without marks). */
  averagePercent: number | null;
}

export interface UpcomingExamRow {
  id: number;
  title: string;
  examDate: string;
  section: { id: number; name: string };
  subject: { id: number; name: string };
}

/**
 * GET /dashboard/overview — every number of the dashboard home in one call,
 * scoped to the header branch and the header (or current) academic year.
 * Dates are local to the institute.
 */
export interface DashboardOverview {
  today: string;
  isWorkingDay: boolean;
  academicYear: { id: number; name: string } | null;
  students: { active: number; unassigned: number; newThisMonth: number };
  teachers: number;
  sections: SectionOverviewRow[];
  attendance: {
    today: DayCounts & {
      /** (present + late) ÷ active students, null on a day off / without students. */
      rate: number | null;
    };
    week: AttendanceDayPoint[];
  };
  finance: {
    currencies: FinanceOverviewRow[];
    monthly: { month: string; currency: Currency; amount: number }[];
  };
  exams: { upcoming: UpcomingExamRow[]; averagePercent30d: number | null };
}
