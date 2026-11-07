/**
 * Central registry of distributed locks (like CacheKeys): each lock declares
 * its name builder and maximum hold time. Ad-hoc lock names are forbidden.
 */
export interface LockDef<A extends unknown[] = []> {
  build: (...args: A) => string;
  /** Safety expiry if the holder crashes before releasing. */
  ttlMs: number;
}

function defineLock<A extends unknown[] = []>(
  build: (...args: A) => string,
  ttlMs: number,
): LockDef<A> {
  return { build, ttlMs };
}

export const LockKeys = {
  /**
   * Timetable generation for an academic year. Per year (not per section):
   * the solver shares teachers and rooms across all sections of the year.
   */
  timetableGeneration: defineLock(
    (academicYearId: number) => `timetable-generation:${academicYearId}`,
    2 * 60_000,
  ),
};
