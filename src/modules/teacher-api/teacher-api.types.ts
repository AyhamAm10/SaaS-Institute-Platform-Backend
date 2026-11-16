/** Response shapes of the teacher app API (`/api/teacher/*`). Dates are local `YYYY-MM-DD`, times `HH:mm`. */

export type TeacherWeekday =
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

export interface TeacherMe {
  teacher: {
    id: number;
    fullName: string;
    phone: string;
    specialization: string | null;
  };
  institute: { id: number; timezone: string };
  /** Branches the teacher belongs to (send the section's own branch as X-Branch-Id when acting on it). */
  branches: { id: number; name: string }[];
  academicYear: { id: number; name: string; startDate: string; endDate: string } | null;
  schedule: {
    workingDays: number[];
    dayStartTime: string;
    dayEndTime: string;
    periodDurationMinutes: number;
    lateAfterMinutes: number;
    breaks: { name: string; startTime: string; endTime: string }[];
  };
  /** Weekly availability set by the administration (read only). Empty = free at all times. */
  availability: { dayOfWeek: number; startTime: string; endTime: string }[];
}

export interface TeacherLesson {
  id: number;
  startTime: string;
  endTime: string;
  periodNumber: number | null;
  sectionId: number;
  sectionName: string;
  subjectId: number;
  subjectName: string;
  room: string | null;
}

export interface TeacherTimetable {
  academicYearId: number | null;
  breaks: { name: string; startTime: string; endTime: string }[];
  days: { dayOfWeek: number; weekday: TeacherWeekday; lessons: TeacherLesson[] }[];
}

export interface TeacherSection {
  sectionId: number;
  name: string;
  grade: string | null;
  branchId: number;
  branchName: string | null;
  academicYearId: number;
  studentCount: number;
  subjects: { subjectId: number; name: string }[];
}

export interface TeacherStudent {
  id: number;
  fullName: string;
  gender: string;
  familyName: string | null;
  /** Guardian phone: visible to the teacher of the student's section only. */
  guardianPhone: string | null;
}

export interface TeacherSectionStudents {
  section: { id: number; name: string; branchId: number; academicYearId: number };
  students: TeacherStudent[];
}

export interface TeacherOverview {
  date: string;
  /** Institute-local time `HH:mm` (so the app needs no time zone math). */
  now: string;
  dayOfWeek: number;
  /** Weekly working day of the institute schedule. */
  isWorkingDay: boolean;
  lessons: TeacherLesson[];
  upcomingExams: ExamBrief[];
  pendingMarks: (ExamBrief & { pending: number })[];
}

export interface ExamBrief {
  examId: number;
  title: string;
  date: string;
  sectionId: number;
  sectionName: string;
  subjectId: number;
  subjectName: string;
}
