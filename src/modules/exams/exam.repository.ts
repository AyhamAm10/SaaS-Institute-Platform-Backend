import { Inject, Injectable } from '@nestjs/common';
import { Exam, ExamResult, Prisma } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { ContextScopedRepository } from '../../database/context-scoped.repository';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../../common/time/timezone';
import { createPaginatedResult } from '../../common/pagination/paginated-result';
import { ExamQueryDto } from './dto/exam.dto';

const EXAM_INCLUDE = {
  section: { select: { id: true, name: true, academicYearId: true } },
  subject: { select: { id: true, name: true } },
  examType: { select: { id: true, name: true } },
  _count: { select: { results: true } },
} as const;

/** Exam with the relations of EXAM_INCLUDE. */
export interface ExamWithRefs extends Exam {
  section: { id: number; name: string; academicYearId: number };
  subject: { id: number; name: string };
  examType: { id: number; name: string } | null;
  _count: { results: number };
}

/** Exams. Audited (updates and deletions go to AuditLog). */
@Injectable()
export class ExamRepository extends ContextScopedRepository<Exam> {
  // Header year / branch through the section (role.md §3)
  protected override readonly yearKey = 'section.academicYearId';
  protected override readonly branchKey = 'section.branchId';
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'exam');
  }

  async findDetails(id: number) {
    return this.client.exam.findFirst({
      where: this.scopeWhere({ id }),
      include: EXAM_INCLUDE,
    });
  }

  /** `onlyPairs`: teacher scope, only these (section, subject) pairs. */
  async findFiltered(
    query: ExamQueryDto,
    onlyPairs?: { sectionId: number; subjectId: number }[],
  ) {
    const where: Prisma.ExamWhereInput = {
      ...(onlyPairs && {
        OR: onlyPairs.map((p) => ({
          sectionId: p.sectionId,
          subjectId: p.subjectId,
        })),
      }),
      ...(query.sectionId && { sectionId: query.sectionId }),
      ...(query.subjectId && { subjectId: query.subjectId }),
      ...(query.examTypeId && { examTypeId: query.examTypeId }),
      ...((query.from || query.to) && {
        examDate: {
          ...(query.from && { gte: dateOnly(query.from) }),
          ...(query.to && { lte: dateOnly(query.to) }),
        },
      }),
      ...(query.search?.trim() && {
        title: { contains: query.search.trim(), mode: 'insensitive' },
      }),
    };
    const scoped = this.scopeWhere(where as Record<string, unknown>);
    const [data, total] = await Promise.all([
      this.client.exam.findMany({
        where: scoped,
        include: EXAM_INCLUDE,
        orderBy: [{ examDate: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.client.exam.count({ where: scoped }),
    ]);
    return createPaginatedResult(data, total, query.page, query.limit);
  }

  /** Exams of a year between two local dates, soonest first (dashboard). */
  async findUpcoming(
    academicYearId: number,
    from: string,
    to: string,
    take: number,
    branchId?: number,
  ): Promise<ExamWithRefs[]> {
    return this.client.exam.findMany({
      where: this.scopeWhere({
        examDate: { gte: dateOnly(from), lte: dateOnly(to) },
        section: { academicYearId, ...(branchId && { branchId }) },
      }),
      include: EXAM_INCLUDE,
      orderBy: [{ examDate: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  /**
   * Exams of one section from a local date on (inclusive), soonest first,
   * only for the given subjects (what the student actually studies).
   */
  async findUpcomingForSection(
    sectionId: number,
    from: string,
    subjectIds: number[],
    take: number,
  ): Promise<ExamWithRefs[]> {
    if (subjectIds.length === 0) return [];
    return this.client.exam.findMany({
      where: this.scopeWhere({
        sectionId,
        subjectId: { in: subjectIds },
        examDate: { gte: dateOnly(from) },
      }),
      include: EXAM_INCLUDE,
      orderBy: [{ examDate: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  /** Section, date and maximum mark of every exam of a year (averages). */
  async findForYear(
    academicYearId: number,
    branchId?: number,
  ): Promise<
    { id: number; sectionId: number; examDate: Date; maxMark: Prisma.Decimal }[]
  > {
    return this.client.exam.findMany({
      where: this.scopeWhere({
        section: { academicYearId, ...(branchId && { branchId }) },
      }),
      select: { id: true, sectionId: true, examDate: true, maxMark: true },
    });
  }

  /**
   * Exams with their marks for reports (D3). `onlyPairs` = teacher scope;
   * dates are local and inclusive.
   */
  async findWithResults(filter: {
    academicYearId?: number;
    sectionId?: number;
    branchId?: number;
    from?: string;
    to?: string;
    onlyPairs?: { sectionId: number; subjectId: number }[];
    take: number;
  }): Promise<ReportExam[]> {
    const where: Prisma.ExamWhereInput = {
      ...(filter.onlyPairs && {
        OR: filter.onlyPairs.map((p) => ({
          sectionId: p.sectionId,
          subjectId: p.subjectId,
        })),
      }),
      ...(filter.sectionId && { sectionId: filter.sectionId }),
      section: {
        ...(filter.academicYearId && { academicYearId: filter.academicYearId }),
        ...(filter.branchId && { branchId: filter.branchId }),
      },
      ...((filter.from || filter.to) && {
        examDate: {
          ...(filter.from && { gte: dateOnly(filter.from) }),
          ...(filter.to && { lte: dateOnly(filter.to) }),
        },
      }),
    };
    return this.client.exam.findMany({
      where: this.scopeWhere(where as Record<string, unknown>),
      include: {
        subject: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        examType: { select: { name: true } },
        results: {
          select: { studentId: true, mark: true, status: true },
        },
      },
      orderBy: [{ examDate: 'asc' }, { id: 'asc' }],
      take: filter.take,
    });
  }
}

/** Exam marks (one per exam and student). Audited. */
@Injectable()
export class ExamResultRepository extends TenantAwareRepository<ExamResult> {
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'examResult');
  }

  async findByExam(examId: number): Promise<ExamResult[]> {
    return this.findMany({ where: { examId } });
  }

  /** Results with the student name (mark sheet). */
  async findByExamWithStudents(examId: number) {
    return this.client.examResult.findMany({
      where: this.scopeWhere({ examId }),
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            family: { select: { familyName: true } },
          },
        },
      },
    }) as Promise<
      (ExamResult & {
        student: {
          id: number;
          fullName: string;
          family: { familyName: string } | null;
        };
      })[]
    >;
  }

  /** Average mark and number of graded marks per exam of a year (dashboard). */
  async averageByExam(
    academicYearId: number,
    branchId?: number,
  ): Promise<{ examId: number; averageMark: number | null; graded: number }[]> {
    const rows: {
      examId: number;
      _avg: { mark: Prisma.Decimal | null };
      _count: { mark: number };
    }[] = await this.client.examResult.groupBy({
      by: ['examId'],
      where: {
        instituteId: this.getInstituteId(),
        mark: { not: null },
        exam: { section: { academicYearId, ...(branchId && { branchId }) } },
      },
      _avg: { mark: true },
      _count: { mark: true },
    });
    return rows.map((r) => ({
      examId: r.examId,
      averageMark: r._avg.mark === null ? null : Number(r._avg.mark),
      graded: r._count.mark,
    }));
  }

  async countByExam(examId: number): Promise<number> {
    return this.count({ examId });
  }

  async deleteByExam(examId: number): Promise<void> {
    await this.client.examResult.deleteMany({
      where: this.scopeWhere({ examId }),
    });
  }

  /**
   * Results of a student with exam, subject and type (newest first),
   * optionally only the exams of one academic year.
   */
  async findByStudent(studentId: number, academicYearId?: number) {
    return this.client.examResult.findMany({
      where: this.scopeWhere({
        studentId,
        ...(academicYearId !== undefined && {
          exam: { section: { academicYearId } },
        }),
      }),
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            examDate: true,
            maxMark: true,
            passMark: true,
            subject: { select: { id: true, name: true } },
            examType: { select: { id: true, name: true } },
            section: { select: { id: true, name: true, academicYearId: true } },
          },
        },
      },
      orderBy: { exam: { examDate: 'desc' } },
    }) as Promise<StudentResultRow[]>;
  }
}

export interface StudentResultRow extends ExamResult {
  exam: {
    id: number;
    title: string;
    examDate: Date;
    maxMark: Prisma.Decimal;
    passMark: Prisma.Decimal;
    subject: { id: number; name: string };
    examType: { id: number; name: string } | null;
    section: { id: number; name: string; academicYearId: number };
  };
}

/** Exam with its marks as the reports read it (D3). */
export interface ReportExam extends Exam {
  subject: { id: number; name: string };
  section: { id: number; name: string };
  examType: { name: string } | null;
  results: {
    studentId: number;
    mark: Prisma.Decimal | null;
    status: ExamResult['status'];
  }[];
}
