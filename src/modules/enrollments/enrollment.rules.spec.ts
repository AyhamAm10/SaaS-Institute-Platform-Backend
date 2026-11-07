import { EnrollmentStatus } from '@prisma/client';
import {
  canChangeStatus,
  effectiveSubjectIds,
  normalizeSubjectChoice,
} from './enrollment.rules';

describe('enrollment rules', () => {
  it('allows only the planned status changes', () => {
    const { ACTIVE, WITHDRAWN, COMPLETED } = EnrollmentStatus;
    expect(canChangeStatus(ACTIVE, WITHDRAWN)).toBe(true);
    expect(canChangeStatus(ACTIVE, COMPLETED)).toBe(true);
    expect(canChangeStatus(WITHDRAWN, ACTIVE)).toBe(true);
    expect(canChangeStatus(WITHDRAWN, COMPLETED)).toBe(false);
    expect(canChangeStatus(COMPLETED, ACTIVE)).toBe(false);
    expect(canChangeStatus(ACTIVE, ACTIVE)).toBe(false);
  });

  it('dedupes the choice and reports subjects outside the plan', () => {
    expect(normalizeSubjectChoice([3, 1, 3, 9], [1, 2, 3])).toEqual({
      subjectIds: [1, 3, 9],
      invalid: [9],
    });
  });

  it('stores a choice covering every plan subject as all (empty)', () => {
    expect(normalizeSubjectChoice([2, 1, 3], [1, 2, 3]).subjectIds).toEqual([]);
    expect(normalizeSubjectChoice([], [1, 2]).subjectIds).toEqual([]);
  });

  it('effective subjects fall back to the whole section plan', () => {
    expect(effectiveSubjectIds([], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(effectiveSubjectIds([2], [1, 2, 3])).toEqual([2]);
  });
});
