import { meanPercent, percentOf } from './exams.rules';

/** One mark of a student as the guardian / student apps read it. */
export interface StudentMarkView {
  examId: number;
  title: string;
  /** Local exam date, `YYYY-MM-DD`. */
  date: string;
  score: number | null;
  max: number;
  percent: number | null;
  status: string;
}

export interface StudentSubjectMarksView {
  subjectId: number;
  subject: string;
  averagePercent: number | null;
  /** Newest first. */
  results: StudentMarkView[];
}

export interface StudentMarksView {
  /** Plain mean of the graded percentages (every exam weighs the same). */
  averagePercent: number | null;
  subjects: StudentSubjectMarksView[];
}

interface MarkRow {
  mark: number | null;
  status: string;
  exam: {
    id: number;
    title: string;
    examDate: Date;
    maxMark: unknown;
    subject: { id: number; name: string };
  };
}

/** Groups a student's marks by subject (pure, no I/O). */
export function buildMarksView(rows: MarkRow[]): StudentMarksView {
  const bySubject = new Map<number, StudentSubjectMarksView>();
  const all: (number | null)[] = [];

  for (const row of [...rows].sort(
    (a, b) => b.exam.examDate.getTime() - a.exam.examDate.getTime(),
  )) {
    const max = Number(row.exam.maxMark);
    const percent = percentOf(row.mark, max);
    all.push(percent);
    const subject = bySubject.get(row.exam.subject.id) ?? {
      subjectId: row.exam.subject.id,
      subject: row.exam.subject.name,
      averagePercent: null,
      results: [],
    };
    subject.results.push({
      examId: row.exam.id,
      title: row.exam.title,
      date: row.exam.examDate.toISOString().slice(0, 10),
      score: row.mark,
      max,
      percent,
      status: row.status,
    });
    bySubject.set(row.exam.subject.id, subject);
  }

  const subjects = [...bySubject.values()].map((s) => ({
    ...s,
    averagePercent: meanPercent(s.results.map((r) => r.percent)),
  }));
  return { averagePercent: meanPercent(all), subjects };
}
