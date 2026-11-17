/**
 * System-wide user roles.
 */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  INSTITUTE_ADMIN = 'INSTITUTE_ADMIN',
  /** Staff: students, families, enrollments, attendance (phase 3 D2). */
  REGISTRAR = 'REGISTRAR',
  /** Staff: enters and edits students, families, enrollment, attendance and marks; no deletes, finance or settings. */
  DATA_ENTRY = 'DATA_ENTRY',
  /** Staff: contracts, payments and receipts (phase 3 D2). */
  ACCOUNTANT = 'ACCOUNTANT',
  TEACHER = 'TEACHER',
  FAMILY = 'FAMILY',
  STUDENT = 'STUDENT',
}

/** Roles managed from the staff screen (teachers have their own screen). */
export const STAFF_ROLES = [
  UserRole.INSTITUTE_ADMIN,
  UserRole.REGISTRAR,
  UserRole.ACCOUNTANT,
  UserRole.DATA_ENTRY,
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
