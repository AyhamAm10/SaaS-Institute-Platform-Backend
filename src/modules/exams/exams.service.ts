import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Exam, ExamResultStatus, Prisma } from '@prisma/client';
import { ExamRepository, ExamResultRepository } from './exam.repository';
import { SectionRepository } from '../sections/section.repository';
import { SectionSubjectRepository } from '../sections/section-subject.repository';
import { TeacherScopeService } from '../sections/teacher-scope.service';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
import { ExamTypesService } from '../reference-data/exam-types/exam-types.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { dateOnly, shiftLocalDate } from '../../common/time/timezone';
import {
  examStats,
  resultStatus,
  subjectAverages,
  validMark,
  validMarkBounds,
  weightedAveragePercent,
} from './exams.rules';

/** Dashboard windows (days). */
const UPCOMING_DAYS = 14;
const UPCOMING_LIMIT = 5;
const RECENT_DAYS = 30;
import {
  CreateExamDto,
  ExamQueryDto,
  SaveResultsDto,
  UpdateExamDto,
} from './dto/exam.dto';

const fail = (key: string, params?: Record<string, string>): never => {
  throw new BadRequestException(ErrorMessages.get(key, params));
};
const num = (v: Prisma.Decimal | null): number | null =>
  v === null ? null : Number(v);

/**
 * Exams and marks (role.md §10.5). An exam belongs to a section and one of
 * its plan subjects; its students are the ACTIVE enrollments that study the
 * subject (EnrollmentsService rule); marks are upserted in bulk and the
 * status is always computed here.
 */
@Injectable()
export class ExamsService {
  constructor(
    @Inject(ExamRepository) private readonly examRepository: ExamRepository,
    @Inject(ExamResultRepository)
    private readonly resultRepository: ExamResultRepository,
    @Inject(SectionRepository)
    private readonly sectionRepository: SectionRepository,
    @Inject(SectionSubjectRepository)
    private readonly sectionSubjectRepository: SectionSubjectRepository,
    @Inject(AcademicYearRepository)
    private readonly yearRepository: AcademicYearRepository,
    @Inject(ExamTypesService) private readonly examTypes: ExamTypesService,
    @Inject(EnrollmentsService)
    private readonly enrollments: EnrollmentsService,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
    @Inject(TeacherScopeService)
    private readonly teacherScope: TeacherScopeService,
  ) {}

  /** Teachers only see the exams of the subjects they teach (role.md §8.6). */
  async findAll(query: ExamQueryDto) {
    const pairs = await this.teacherScope.taughtPairs();
    return this.examRepository.findFiltered(query, pairs ?? undefined);
  }

  async create(dto: CreateExamDto) {
    const section = await this.sectionRepository.findById(dto.sectionId);
    Ensure.exists(section, 'Section');
    const inPlan = await this.sectionSubjectRepository.findBySectionAndSubject(
      section.id,
      dto.subjectId,
    );
    if (!inPlan) fail('exam_subject_not_in_section');
    await this.validateCommon(section.academicYearId, dto);

    const exam = await this.examRepository.create({
      sectionId: section.id,
      subjectId: dto.subjectId,
      examTypeId: dto.examTypeId ?? null,
      title: dto.title.trim(),
      examDate: dateOnly(dto.examDate),
      maxMark: new Prisma.Decimal(dto.maxMark),
      passMark: new Prisma.Decimal(dto.passMark),
    });
    return this.findDetails(exam.id);
  }

  /** Changing the marks bounds re-computes the status of existing results. */
  async update(id: number, dto: UpdateExamDto) {
    const exam = await this.getExam(id);
    const section = await this.sectionRepository.findById(exam.sectionId);
    Ensure.exists(section, 'Section');
    const merged = {
      examTypeId:
        dto.examTypeId === undefined ? exam.examTypeId : dto.examTypeId,
      examDate: dto.examDate ?? exam.examDate.toISOString().slice(0, 10),
      maxMark: dto.maxMark ?? Number(exam.maxMark),
      passMark: dto.passMark ?? Number(exam.passMark),
    };
    await this.validateCommon(section.academicYearId, merged);

    const results = await this.resultRepository.findByExam(id);
    if (
      results.some((r) => r.mark !== null && Number(r.mark) > merged.maxMark)
    ) {
      fail('exam_max_below_marks');
    }

    await this.transactionHelper.executeInTransaction(async () => {
      await this.examRepository.update(id, {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        examTypeId: merged.examTypeId,
        examDate: dateOnly(merged.examDate),
        maxMark: new Prisma.Decimal(merged.maxMark),
        passMark: new Prisma.Decimal(merged.passMark),
      });
      for (const r of results) {
        const status = resultStatus(
          num(r.mark),
          r.status === ExamResultStatus.ABSENT,
          merged.passMark,
        );
        if (status !== r.status) {
          await this.resultRepository.update(r.id, { status });
        }
      }
    });
    return this.findDetails(id);
  }

  /** Refuses an exam with marks unless `force` (both deletions are audited). */
  async delete(id: number, force: boolean): Promise<{ deleted: true }> {
    await this.getExam(id);
    const count = await this.resultRepository.countByExam(id);
    if (count > 0 && !force) {
      throw new ConflictException(
        ErrorMessages.get('exam_has_results', { count: String(count) }),
      );
    }
    await this.transactionHelper.executeInTransaction(async () => {
      await this.resultRepository.deleteByExam(id);
      await this.examRepository.delete(id);
    });
    return { deleted: true };
  }

  async findDetails(id: number) {
    const exam = await this.examRepository.findDetails(id);
    Ensure.exists(exam, 'Exam');
    await this.teacherScope.assertTeachesSubject(
      exam.sectionId,
      exam.subjectId,
    );
    return exam;
  }

  /**
   * Mark sheet: eligible students (and anyone who already has a mark, e.g.
   * after a transfer) with their result, plus the statistics.
   */
  async getResults(id: number) {
    const exam = await this.findDetails(id);
    const [eligible, results] = await Promise.all([
      this.enrollments.findStudentsTakingSubject(
        exam.sectionId,
        exam.subjectId,
      ),
      this.resultRepository.findByExamWithStudents(id),
    ]);
    const byStudent = new Map(results.map((r) => [r.studentId, r]));
    const eligibleIds = new Set(eligible.map((s) => s.id));
    const rows = eligible.map((student) => ({
      student,
      eligible: true,
      result: this.toResult(byStudent.get(student.id)),
    }));
    for (const r of results) {
      if (!eligibleIds.has(r.studentId)) {
        rows.push({
          student: {
            id: r.student.id,
            fullName: r.student.fullName,
            familyName: r.student.family?.familyName ?? null,
          },
          eligible: false,
          result: this.toResult(r),
        });
      }
    }
    const scored = rows.flatMap((row) => (row.result ? [row.result] : []));
    return { exam, rows, stats: examStats(scored, rows.length) };
  }

  /** Bulk upsert; the status is computed, never sent by the client. */
  async saveResults(id: number, dto: SaveResultsDto) {
    const exam = await this.getExam(id);
    await this.teacherScope.assertTeachesSubject(
      exam.sectionId,
      exam.subjectId,
    );
    const maxMark = Number(exam.maxMark);
    const passMark = Number(exam.passMark);
    const [eligible, existing] = await Promise.all([
      this.enrollments.findStudentsTakingSubject(
        exam.sectionId,
        exam.subjectId,
      ),
      this.resultRepository.findByExam(id),
    ]);
    const allowed = new Set([
      ...eligible.map((s) => s.id),
      ...existing.map((r) => r.studentId),
    ]);
    const byStudent = new Map(existing.map((r) => [r.studentId, r]));

    for (const entry of dto.results) {
      if (!allowed.has(entry.studentId)) fail('exam_student_not_eligible');
      const mark = entry.absent ? null : (entry.mark ?? null);
      if (mark !== null && !validMark(mark, maxMark)) {
        fail('exam_mark_out_of_range', { max: String(maxMark) });
      }
    }

    await this.transactionHelper.executeInTransaction(async () => {
      for (const entry of dto.results) {
        const absent = Boolean(entry.absent);
        const mark = absent ? null : (entry.mark ?? null);
        const data = {
          mark: mark === null ? null : new Prisma.Decimal(mark),
          status: resultStatus(mark, absent, passMark),
        };
        const current = byStudent.get(entry.studentId);
        if (!current) {
          await this.resultRepository.create({
            examId: id,
            studentId: entry.studentId,
            ...data,
          });
        } else if (
          num(current.mark) !== mark ||
          current.status !== data.status
        ) {
          await this.resultRepository.update(current.id, data);
        }
      }
    });
    return this.getResults(id);
  }

  /**
   * Exams with their marks for reports (D3); a teacher only gets the
   * (section, subject) pairs they teach.
   */
  async getExamsWithResults(filter: {
    academicYearId?: number;
    sectionId?: number;
    branchId?: number;
    from?: string;
    to?: string;
    take: number;
  }) {
    const pairs = await this.teacherScope.taughtPairs();
    if (pairs && pairs.length === 0) return [];
    return this.examRepository.findWithResults({
      ...filter,
      onlyPairs: pairs ?? undefined,
    });
  }

  /** All marks of a student with the average percentage per subject. */
  async getStudentResults(studentId: number) {
    const [all, pairs] = await Promise.all([
      this.resultRepository.findByStudent(studentId),
      this.teacherScope.taughtPairs(),
    ]);
    // Teachers only see the marks of the subjects they teach
    const results = pairs
      ? all.filter((r) =>
          pairs.some(
            (p) =>
              p.sectionId === r.exam.section.id &&
              p.subjectId === r.exam.subject.id,
          ),
        )
      : all;
    const rows = results.map((r) => ({
      id: r.id,
      mark: num(r.mark),
      status: r.status,
      exam: r.exam,
    }));
    return {
      results: rows,
      subjects: subjectAverages(
        rows.map((r) => ({
          subjectId: r.exam.subject.id,
          subjectName: r.exam.subject.name,
          mark: r.mark,
          maxMark: Number(r.exam.maxMark),
        })),
      ),
    };
  }

  /**
   * Dashboard: exams of the next 14 days, the average percentage of the
   * last 30 days, and the average percentage of every section in the year.
   */
  async getOverview(academicYearId: number, today: string, branchId?: number) {
    const [upcoming, averages, exams] = await Promise.all([
      this.examRepository.findUpcoming(
        academicYearId,
        today,
        shiftLocalDate(today, UPCOMING_DAYS),
        UPCOMING_LIMIT,
        branchId,
      ),
      this.resultRepository.averageByExam(academicYearId, branchId),
      this.examRepository.findForYear(academicYearId, branchId),
    ]);
    const examById = new Map(exams.map((e) => [e.id, e]));
    const rows = averages.flatMap((a) => {
      const exam = examById.get(a.examId);
      return exam
        ? [
            {
              ...a,
              maxMark: Number(exam.maxMark),
              sectionId: exam.sectionId,
              date: exam.examDate.toISOString().slice(0, 10),
            },
          ]
        : [];
    });

    const from = shiftLocalDate(today, -RECENT_DAYS);
    const sectionIds = [...new Set(rows.map((r) => r.sectionId))];
    return {
      upcoming: upcoming.map((e) => ({
        id: e.id,
        title: e.title,
        examDate: e.examDate.toISOString().slice(0, 10),
        section: { id: e.section.id, name: e.section.name },
        subject: { id: e.subject.id, name: e.subject.name },
      })),
      averagePercent30d: weightedAveragePercent(
        rows.filter((r) => r.date >= from && r.date <= today),
      ),
      sectionAverages: new Map(
        sectionIds.map((sectionId) => [
          sectionId,
          weightedAveragePercent(rows.filter((r) => r.sectionId === sectionId)),
        ]),
      ),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async getExam(id: number): Promise<Exam> {
    const exam = await this.examRepository.findById(id);
    Ensure.exists(exam, 'Exam');
    return exam;
  }

  private async validateCommon(
    academicYearId: number,
    dto: {
      examTypeId?: number | null;
      examDate: string;
      maxMark: number;
      passMark: number;
    },
  ): Promise<void> {
    if (!validMarkBounds(dto.maxMark, dto.passMark)) fail('exam_invalid_marks');
    if (dto.examTypeId) await this.examTypes.getById(dto.examTypeId);
    const year = await this.yearRepository.findById(academicYearId);
    Ensure.exists(year, 'AcademicYear');
    const date = dateOnly(dto.examDate);
    if (date < year.startDate || date > year.endDate) {
      fail('exam_date_outside_year');
    }
  }

  private toResult(
    r?: {
      id: number;
      mark: Prisma.Decimal | null;
      status: ExamResultStatus;
    } | null,
  ) {
    return r ? { id: r.id, mark: num(r.mark), status: r.status } : null;
  }
}
