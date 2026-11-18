/**
 * Notification catalog. A type belongs to one category; users switch
 * categories on or off (all on by default). The app opens `path` when the
 * notification is tapped.
 */
export const NotificationCategory = {
  ATTENDANCE: 'ATTENDANCE',
  FINANCE: 'FINANCE',
  STUDY: 'STUDY',
  NOTES: 'NOTES',
  GENERAL: 'GENERAL',
} as const;
export type NotificationCategory =
  (typeof NotificationCategory)[keyof typeof NotificationCategory];

export const NotificationType = {
  ATTENDANCE_ARRIVAL: 'ATTENDANCE_ARRIVAL',
  ATTENDANCE_LATE: 'ATTENDANCE_LATE',
  ATTENDANCE_ABSENT: 'ATTENDANCE_ABSENT',
  ATTENDANCE_EARLY_EXIT: 'ATTENDANCE_EARLY_EXIT',
  ATTENDANCE_EXCUSED: 'ATTENDANCE_EXCUSED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  INSTALLMENT_DUE: 'INSTALLMENT_DUE',
  INSTALLMENT_OVERDUE: 'INSTALLMENT_OVERDUE',
  EXAM_SCHEDULED: 'EXAM_SCHEDULED',
  EXAM_RESULT: 'EXAM_RESULT',
  TIMETABLE_CHANGED: 'TIMETABLE_CHANGED',
  STUDENT_NOTE: 'STUDENT_NOTE',
  CLOSURE: 'CLOSURE',
  TEACHER_ASSIGNED: 'TEACHER_ASSIGNED',
  TEACHER_EXAM_CREATED: 'TEACHER_EXAM_CREATED',
  MARKS_REMINDER: 'MARKS_REMINDER',
  LESSON_REMINDER: 'LESSON_REMINDER',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

const T = NotificationType;
const C = NotificationCategory;

export const CATEGORY_OF: Record<NotificationType, NotificationCategory> = {
  [T.ATTENDANCE_ARRIVAL]: C.ATTENDANCE,
  [T.ATTENDANCE_LATE]: C.ATTENDANCE,
  [T.ATTENDANCE_ABSENT]: C.ATTENDANCE,
  [T.ATTENDANCE_EARLY_EXIT]: C.ATTENDANCE,
  [T.ATTENDANCE_EXCUSED]: C.ATTENDANCE,
  [T.PAYMENT_RECEIVED]: C.FINANCE,
  [T.INSTALLMENT_DUE]: C.FINANCE,
  [T.INSTALLMENT_OVERDUE]: C.FINANCE,
  [T.EXAM_SCHEDULED]: C.STUDY,
  [T.EXAM_RESULT]: C.STUDY,
  [T.TIMETABLE_CHANGED]: C.STUDY,
  [T.STUDENT_NOTE]: C.NOTES,
  [T.CLOSURE]: C.GENERAL,
  [T.TEACHER_ASSIGNED]: C.STUDY,
  [T.TEACHER_EXAM_CREATED]: C.STUDY,
  [T.MARKS_REMINDER]: C.STUDY,
  [T.LESSON_REMINDER]: C.STUDY,
};

/** Screen opened in the apps when the notification is tapped. */
export const PATH_OF: Record<NotificationType, string> = {
  [T.ATTENDANCE_ARRIVAL]: '/attendance',
  [T.ATTENDANCE_LATE]: '/attendance',
  [T.ATTENDANCE_ABSENT]: '/attendance',
  [T.ATTENDANCE_EARLY_EXIT]: '/attendance',
  [T.ATTENDANCE_EXCUSED]: '/attendance',
  [T.PAYMENT_RECEIVED]: '/finance',
  [T.INSTALLMENT_DUE]: '/finance',
  [T.INSTALLMENT_OVERDUE]: '/finance',
  [T.EXAM_SCHEDULED]: '/marks',
  [T.EXAM_RESULT]: '/marks',
  [T.TIMETABLE_CHANGED]: '/timetable',
  [T.STUDENT_NOTE]: '/notes',
  [T.CLOSURE]: '/notifications',
  [T.TEACHER_ASSIGNED]: '/sections',
  [T.TEACHER_EXAM_CREATED]: '/notifications',
  [T.MARKS_REMINDER]: '/notifications',
  [T.LESSON_REMINDER]: '/timetable',
};

/** What a domain event asks to send (one row per user in the inbox). */
export interface NotifyInput {
  userIds: number[];
  type: NotificationType;
  title: string;
  body: string;
  /** The child it is about (parents app switches to that child on tap). */
  studentId?: number | null;
  /** Ids of the source record, kept for the apps. */
  extra?: Record<string, string | number>;
  /** Same key for the same user = sent once (e.g. `att-in:12:2026-11-17`). */
  dedupeKey?: string;
}

/** Every category, in the order the apps show them. */
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  C.ATTENDANCE,
  C.FINANCE,
  C.STUDY,
  C.NOTES,
  C.GENERAL,
];
