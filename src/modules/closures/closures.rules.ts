import { ClosureScope } from '@prisma/client';

/** A closure as the rules see it (local dates, section ids flattened). */
export interface ClosureInfo {
  id: number;
  scope: ClosureScope;
  branchId: number | null;
  fromDate: string;
  toDate: string;
  reason: string;
  sectionIds: number[];
}

/** Who a day is asked about: the student's branch and active sections. */
export interface ClosureAudience {
  branchId?: number;
  sectionIds?: number[];
}

/** Longest closure that may be declared in one go (guards against typos like year 2062). */
export const MAX_CLOSURE_DAYS = 366;

/** Whether the closure applies to `date` and to the audience. */
export function closureCovers(
  closure: ClosureInfo,
  date: string,
  audience: ClosureAudience,
): boolean {
  if (date < closure.fromDate || date > closure.toDate) return false;
  switch (closure.scope) {
    case ClosureScope.INSTITUTE:
      return true;
    case ClosureScope.BRANCH:
      return (
        audience.branchId !== undefined &&
        audience.branchId === closure.branchId
      );
    case ClosureScope.SECTION:
      return (audience.sectionIds ?? []).some((id) =>
        closure.sectionIds.includes(id),
      );
  }
}

/** First closure covering the audience on `date`, or null. */
export function findCovering(
  closures: ClosureInfo[],
  date: string,
  audience: ClosureAudience,
): ClosureInfo | null {
  return closures.find((c) => closureCovers(c, date, audience)) ?? null;
}

/**
 * What a day's closures exclude when absences are marked: everyone
 * (`all`), or the students of some branches / sections.
 */
export interface ClosedGroups {
  all: boolean;
  branchIds: number[];
  sectionIds: number[];
}

export function closedGroupsOn(
  closures: ClosureInfo[],
  date: string,
): ClosedGroups {
  const groups: ClosedGroups = { all: false, branchIds: [], sectionIds: [] };
  for (const c of closures) {
    if (date < c.fromDate || date > c.toDate) continue;
    if (c.scope === ClosureScope.INSTITUTE) groups.all = true;
    else if (c.scope === ClosureScope.BRANCH && c.branchId !== null)
      groups.branchIds.push(c.branchId);
    else groups.sectionIds.push(...c.sectionIds);
  }
  return groups;
}
