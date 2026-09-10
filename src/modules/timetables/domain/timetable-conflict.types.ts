export enum ConflictType {
  TEACHER_DOUBLE_BOOKING = 'TEACHER_DOUBLE_BOOKING',
  SECTION_DOUBLE_BOOKING = 'SECTION_DOUBLE_BOOKING',
  ROOM_DOUBLE_BOOKING = 'ROOM_DOUBLE_BOOKING',
  TEACHER_UNAVAILABLE = 'TEACHER_UNAVAILABLE',
  ROOM_UNAVAILABLE = 'ROOM_UNAVAILABLE',
  WEEKLY_PERIODS_MISMATCH = 'WEEKLY_PERIODS_MISMATCH',
  TEACHER_NOT_QUALIFIED = 'TEACHER_NOT_QUALIFIED',
  SCHEDULE_CONFIG_VIOLATION = 'SCHEDULE_CONFIG_VIOLATION',
}

export type ConflictSeverity = 'HARD' | 'SOFT';

export interface TimetableConflictDetails {
  dayOfWeek?: number;
  periodNumber?: number;
  startTime?: string;
  endTime?: string;
  teacherId?: number;
  teacherName?: string;
  sectionId?: number;
  sectionName?: string;
  roomId?: number;
  roomName?: string;
  subjectId?: number;
  subjectName?: string;
  requiredPeriods?: number;
  scheduledPeriods?: number;
  reason?: string;
}

export interface TimetableConflict {
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  details: TimetableConflictDetails;
}
