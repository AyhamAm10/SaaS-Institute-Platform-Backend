/**
 * What is attached to a student before it is (soft) deleted, so the
 * dashboard can warn the user. Nothing listed here is removed.
 */
export interface StudentDeletionReport {
  studentId: number;
  enrollments: number;
  examResults: number;
  lessonAttendance: number;
  subscriptions: number;
  payments: number;
}
