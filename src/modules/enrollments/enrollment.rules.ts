import { EnrollmentStatus } from '@prisma/client';

/**
 * Pure enrollment rules (no I/O) — shared by the service and its tests.
 */

/** Allowed status changes: from → targets. */
const TRANSITIONS: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  ACTIVE: [EnrollmentStatus.WITHDRAWN, EnrollmentStatus.COMPLETED],
  WITHDRAWN: [EnrollmentStatus.ACTIVE],
  COMPLETED: [],
  TRANSFERRED: [],
};

export function canChangeStatus(
  from: EnrollmentStatus,
  to: EnrollmentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Normalise a subject choice against the section plan:
 * - removes duplicates and sorts;
 * - returns `invalid` ids that are not in the section;
 * - a choice covering every section subject is stored as "all" (empty list).
 */
export function normalizeSubjectChoice(
  subjectIds: number[],
  sectionSubjectIds: number[],
): { subjectIds: number[]; invalid: number[] } {
  const plan = new Set(sectionSubjectIds);
  const unique = [...new Set(subjectIds)].sort((a, b) => a - b);
  const invalid = unique.filter((id) => !plan.has(id));
  const takesAll = unique.length === plan.size && invalid.length === 0;
  return { subjectIds: takesAll ? [] : unique, invalid };
}

/** Effective subjects: the chosen ones, or all section subjects when none chosen. */
export function effectiveSubjectIds(
  chosenSubjectIds: number[],
  sectionSubjectIds: number[],
): number[] {
  return chosenSubjectIds.length > 0 ? chosenSubjectIds : sectionSubjectIds;
}
