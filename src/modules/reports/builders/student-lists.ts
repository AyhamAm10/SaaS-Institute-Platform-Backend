import { ReportBlock, ReportColumn, ReportRow } from '../document/report-document';
import { dateText, GENDER_LABELS, isoDate } from '../document/report-format';

/**
 * Pure helpers of the student lists (directory "group by" and the exam candidates):
 * grouping a list by one official attribute and turning groups into report blocks.
 */

/** What a student list can be grouped by (`groupBy` report parameter). */
export const STUDENT_GROUPS = ['section', 'gender', 'nationality', 'religion', 'language', 'situation', 'status'] as const;
export type StudentGroup = (typeof STUDENT_GROUPS)[number];

export const STUDENT_GROUP_LABELS: Record<StudentGroup, string> = {
  section: 'الشعبة',
  gender: 'الجنس',
  nationality: 'الجنسية',
  religion: 'الديانة',
  language: 'اللغة',
  situation: 'وضع الطالب',
  status: 'الحالة',
};

/** The parts of a listed student these helpers read (as `StudentsService.findAll` returns it). */
export interface ListedStudent {
  fullName: string;
  gender: string;
  birthDate: Date | string;
  birthPlace?: string | null;
  family?: { familyName?: string | null; fatherName?: string | null; motherName?: string | null; phone?: string | null } | null;
  status?: { name: string } | null;
  nationality?: { name: string } | null;
  religion?: { name: string } | null;
  language?: { name: string } | null;
  /** Only the enrollment of the context year. */
  studentEnrollments?: {
    status: string;
    section?: { name: string } | null;
    situation?: { name: string } | null;
    examLanguage?: { id: number; name: string } | null;
    candidateNumber?: string | null;
    isExamCandidate?: boolean;
  }[];
}

const NOT_SET = 'غير محدد';

/** The enrollment of the context year (the list carries only that one). */
export function yearEnrollment(s: ListedStudent) {
  const list = s.studentEnrollments ?? [];
  return list.find((e) => e.status === 'ACTIVE') ?? list[0] ?? null;
}

export function groupValue(s: ListedStudent, by: StudentGroup): string {
  switch (by) {
    case 'section':
      return yearEnrollment(s)?.section?.name ?? 'بلا شعبة';
    case 'gender':
      return GENDER_LABELS[s.gender] ?? NOT_SET;
    case 'situation':
      return yearEnrollment(s)?.situation?.name ?? NOT_SET;
    default:
      return s[by]?.name ?? NOT_SET;
  }
}

/** Groups in a stable order: by name, the "not set" group last. */
export function groupStudents<T extends ListedStudent>(students: T[], key: (s: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const s of students) {
    const k = key(s);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups].sort(([a], [b]) => {
    if (a === NOT_SET || a === 'بلا شعبة') return 1;
    if (b === NOT_SET || b === 'بلا شعبة') return -1;
    return a.localeCompare(b, 'ar');
  });
}

/** One table per group (numbered from 1 inside each group) plus a bar of the group sizes. */
export function groupedBlocks<T extends ListedStudent>(
  students: T[],
  by: StudentGroup,
  columns: ReportColumn[],
  toRow: (s: T, n: number) => ReportRow,
): ReportBlock[] {
  const groups = groupStudents(students, (s) => groupValue(s, by));
  return [
    {
      type: 'bars',
      title: `التوزيع حسب ${STUDENT_GROUP_LABELS[by]}`,
      items: groups.map(([label, list]) => ({
        label,
        value: students.length ? Math.round((list.length / students.length) * 1000) / 10 : 0,
        caption: String(list.length),
      })),
    },
    ...groups.map(([label, list]): ReportBlock => ({
      type: 'table',
      title: `${STUDENT_GROUP_LABELS[by]}: ${label} (${list.length})`,
      columns,
      rows: list.map((s, i) => toRow(s, i + 1)),
    })),
  ];
}

/** The columns of the exam candidates list (what the official lists ask for). */
export const CANDIDATE_COLUMNS: ReportColumn[] = [
  { key: 'n', title: '#', kind: 'number', width: 0.35 },
  { key: 'number', title: 'رقم الاكتتاب', kind: 'text', width: 0.8 },
  { key: 'student', title: 'الاسم', kind: 'text', width: 1.4 },
  { key: 'father', title: 'الأب', kind: 'text' },
  { key: 'mother', title: 'الأم', kind: 'text' },
  { key: 'birth', title: 'الولادة', kind: 'text', width: 1.1 },
  { key: 'nationality', title: 'الجنسية', kind: 'text', width: 0.8 },
  { key: 'section', title: 'الشعبة', kind: 'text', width: 0.8 },
  { key: 'situation', title: 'الوضع', kind: 'text', width: 0.8 },
];

export function candidateRow(s: ListedStudent, n: number): ReportRow {
  const e = yearEnrollment(s);
  const place = s.birthPlace?.trim();
  return {
    n,
    number: e?.candidateNumber ?? '—',
    student: s.fullName,
    father: s.family?.fatherName ?? '—',
    mother: s.family?.motherName ?? '—',
    // Date first, then the place: a mixed Latin/Arabic cell stays readable right to left
    birth: [dateText(isoDate(s.birthDate)), place].filter(Boolean).join('، '),
    nationality: s.nationality?.name ?? '—',
    section: e?.section?.name ?? '—',
    situation: e?.situation?.name ?? '—',
  };
}

/** Candidates grouped by exam language, then gender (how the official lists are printed). */
export function candidateBlocks(students: ListedStudent[]): ReportBlock[] {
  const byLanguage = groupStudents(students, (s) => yearEnrollment(s)?.examLanguage?.name ?? NOT_SET);
  return byLanguage.flatMap(([language, list]) =>
    groupStudents(list, (s) => GENDER_LABELS[s.gender] ?? NOT_SET).map(([gender, group]): ReportBlock => ({
      type: 'table',
      title: `${language === NOT_SET ? 'لغة غير محددة' : `اللغة ${language}`} - ${gender} (${group.length})`,
      columns: CANDIDATE_COLUMNS,
      rows: [...group].sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar')).map((s, i) => candidateRow(s, i + 1)),
    })),
  );
}
