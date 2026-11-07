import { ExamResultStatus } from '@prisma/client';

/**
 * Pure exam rules (no I/O). Marks are plain numbers with up to 2 decimals.
 */

/** 0 < passMark ≤ maxMark. */
export function validMarkBounds(maxMark: number, passMark: number): boolean {
  return maxMark > 0 && passMark > 0 && passMark <= maxMark;
}

/** A mark must be within [0, maxMark] with at most two decimals. */
export function validMark(mark: number, maxMark: number): boolean {
  const cents = mark * 100;
  return (
    mark >= 0 && mark <= maxMark && Math.abs(cents - Math.round(cents)) < 1e-6
  );
}

/**
 * Status of a result: ABSENT when marked so, PENDING without a mark,
 * otherwise PASSED / FAILED against passMark.
 */
export function resultStatus(
  mark: number | null,
  absent: boolean,
  passMark: number,
): ExamResultStatus {
  if (absent) return ExamResultStatus.ABSENT;
  if (mark === null) return ExamResultStatus.PENDING;
  return mark >= passMark ? ExamResultStatus.PASSED : ExamResultStatus.FAILED;
}

export interface ExamStats {
  students: number;
  graded: number;
  passed: number;
  failed: number;
  absent: number;
  pending: number;
  /** Average of the graded marks (null when nothing is graded). */
  average: number | null;
}

export function examStats(
  results: { mark: number | null; status: ExamResultStatus }[],
  students: number,
): ExamStats {
  const graded = results.filter((r) => r.mark !== null);
  const count = (s: ExamResultStatus) =>
    results.filter((r) => r.status === s).length;
  const sum = graded.reduce((acc, r) => acc + (r.mark ?? 0), 0);
  return {
    students,
    graded: graded.length,
    passed: count(ExamResultStatus.PASSED),
    failed: count(ExamResultStatus.FAILED),
    absent: count(ExamResultStatus.ABSENT),
    pending: students - graded.length - count(ExamResultStatus.ABSENT),
    average: graded.length
      ? Math.round((sum / graded.length) * 100) / 100
      : null,
  };
}

/** Average percentage (mark / maxMark) per subject over graded results. */
export function subjectAverages(
  results: {
    subjectId: number;
    subjectName: string;
    mark: number | null;
    maxMark: number;
  }[],
): {
  subjectId: number;
  subjectName: string;
  exams: number;
  averagePercent: number | null;
}[] {
  const bySubject = new Map<
    number,
    { name: string; exams: number; percents: number[] }
  >();
  for (const r of results) {
    const row = bySubject.get(r.subjectId) ?? {
      name: r.subjectName,
      exams: 0,
      percents: [],
    };
    row.exams++;
    if (r.mark !== null && r.maxMark > 0)
      row.percents.push((r.mark / r.maxMark) * 100);
    bySubject.set(r.subjectId, row);
  }
  return [...bySubject.entries()].map(([subjectId, row]) => ({
    subjectId,
    subjectName: row.name,
    exams: row.exams,
    averagePercent: row.percents.length
      ? Math.round(
          (row.percents.reduce((a, b) => a + b, 0) / row.percents.length) * 10,
        ) / 10
      : null,
  }));
}

/**
 * Average percentage over several exams, weighted by the number of graded
 * marks of each exam: Σ(avg / max × count) ÷ Σ count. Null without marks.
 */
export function weightedAveragePercent(
  rows: { averageMark: number | null; graded: number; maxMark: number }[],
): number | null {
  const usable = rows.filter(
    (r) => r.averageMark !== null && r.graded > 0 && r.maxMark > 0,
  );
  const graded = usable.reduce((sum, r) => sum + r.graded, 0);
  if (graded === 0) return null;
  const weighted = usable.reduce(
    (sum, r) => sum + ((r.averageMark as number) / r.maxMark) * 100 * r.graded,
    0,
  );
  return Math.round((weighted / graded) * 10) / 10;
}
