import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EnrollmentStatus, Section, StudentEnrollment } from '@prisma/client';
import {
  RosterRow,
  StudentEnrollmentRepository,
} from '../students/student-enrollment.repository';
import { StudentRepository } from '../students/student.repository';
import { SectionRepository } from '../sections/section.repository';
import { SectionSubjectRepository } from '../sections/section-subject.repository';
import { EnrollmentSubjectRepository } from './enrollment-subject.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import {
  canChangeStatus,
  effectiveSubjectIds,
  normalizeSubjectChoice,
} from './enrollment.rules';
import { BulkEnrollDto, BulkEnrollResult } from './dto/bulk-enroll.dto';
import { TransferEnrollmentDto } from './dto/transfer-enrollment.dto';
import { ChangeEnrollmentStatusDto } from './dto/change-enrollment-status.dto';
import { SetEnrollmentSubjectsDto } from './dto/set-enrollment-subjects.dto';
import { SectionRosterItem } from './dto/section-roster.dto';

type NamedSubject = { id: number; name: string };

const fail = (key: string): never => {
  throw new BadRequestException(ErrorMessages.get(key));
};

/**
 * Enrollment of students in sections (role.md §10.2):
 * one enrollment per student per year, section branch = student branch,
 * transfers inside the same year and branch, and an optional subject subset.
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    @Inject(StudentEnrollmentRepository)
    private readonly enrollmentRepository: StudentEnrollmentRepository,
    @Inject(EnrollmentSubjectRepository)
    private readonly enrollmentSubjectRepository: EnrollmentSubjectRepository,
    @Inject(StudentRepository)
    private readonly studentRepository: StudentRepository,
    @Inject(SectionRepository)
    private readonly sectionRepository: SectionRepository,
    @Inject(SectionSubjectRepository)
    private readonly sectionSubjectRepository: SectionSubjectRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  async getSectionRoster(sectionId: number): Promise<SectionRosterItem[]> {
    const section = await this.getSection(sectionId);
    const [rows, plan] = await Promise.all([
      this.enrollmentRepository.findBySection(
        section.id,
        section.academicYearId,
      ),
      this.getSectionSubjects(section.id),
    ]);
    return rows.map((row) => this.toRosterItem(row, plan));
  }

  /** Enroll several students; each one is accepted or rejected with a reason. */
  async enrollStudents(
    sectionId: number,
    dto: BulkEnrollDto,
  ): Promise<BulkEnrollResult> {
    const section = await this.getSection(sectionId);
    const ids = [...new Set(dto.studentIds)];
    const [students, alreadyEnrolled] = await Promise.all([
      this.studentRepository.findMany({ where: { id: { in: ids } } }),
      this.enrollmentRepository.findEnrolledStudentIds(
        ids,
        section.academicYearId,
      ),
    ]);
    const byId = new Map(students.map((s) => [s.id, s]));

    const result: BulkEnrollResult = { enrolled: [], rejected: [] };
    const accepted: number[] = [];
    for (const studentId of ids) {
      const student = byId.get(studentId);
      const reasonKey = !student
        ? 'enrollment_student_not_found'
        : student.branchId !== section.branchId
          ? 'enrollment_branch_mismatch'
          : alreadyEnrolled.has(studentId)
            ? 'enrollment_already_in_year'
            : null;
      if (reasonKey) {
        result.rejected.push({
          studentId,
          reason: ErrorMessages.get(reasonKey),
        });
      } else {
        accepted.push(studentId);
      }
    }

    await this.transactionHelper.executeInTransaction(async () => {
      for (const studentId of accepted) {
        const enrollment = await this.enrollmentRepository.enroll({
          studentId,
          sectionId: section.id,
          academicYearId: section.academicYearId,
        });
        result.enrolled.push({ studentId, enrollmentId: enrollment.id });
      }
    });
    return result;
  }

  /** Move an active enrollment to another section of the same year and branch. */
  async transfer(
    id: number,
    dto: TransferEnrollmentDto,
  ): Promise<SectionRosterItem> {
    const enrollment = await this.getEnrollment(id);
    if (enrollment.status !== EnrollmentStatus.ACTIVE)
      fail('enrollment_not_active');
    if (enrollment.sectionId === dto.sectionId) fail('enrollment_same_section');

    const target = await this.getSection(dto.sectionId);
    if (target.academicYearId !== enrollment.academicYearId) {
      fail('enrollment_transfer_other_year');
    }
    const student = await this.studentRepository.findById(enrollment.studentId);
    Ensure.exists(student, 'Student');
    if (target.branchId !== student.branchId)
      fail('enrollment_transfer_other_branch');

    const targetPlan = await this.getSectionSubjects(target.id);
    await this.transactionHelper.executeInTransaction(async () => {
      await this.enrollmentRepository.update(id, { sectionId: target.id });
      // Chosen subjects that the new section does not teach are dropped
      await this.enrollmentSubjectRepository.removeOutside(
        id,
        targetPlan.map((s) => s.id),
      );
    });
    return this.getRosterItem(id, enrollment.academicYearId);
  }

  async changeStatus(
    id: number,
    dto: ChangeEnrollmentStatusDto,
  ): Promise<SectionRosterItem> {
    const enrollment = await this.getEnrollment(id);
    if (!canChangeStatus(enrollment.status, dto.status)) {
      fail('enrollment_invalid_status_transition');
    }
    const reason = dto.reason?.trim() || null;
    if (dto.status === EnrollmentStatus.WITHDRAWN && !reason) {
      fail('enrollment_withdraw_reason_required');
    }

    await this.enrollmentRepository.update(id, {
      status: dto.status,
      statusReason: dto.status === EnrollmentStatus.ACTIVE ? null : reason,
      statusChangedAt: new Date(),
    });
    return this.getRosterItem(id, enrollment.academicYearId);
  }

  /** Set the subjects the student takes (empty or all = every section subject). */
  async setSubjects(
    id: number,
    dto: SetEnrollmentSubjectsDto,
  ): Promise<SectionRosterItem> {
    const enrollment = await this.getEnrollment(id);
    if (enrollment.status !== EnrollmentStatus.ACTIVE)
      fail('enrollment_not_active');

    const plan = await this.getSectionSubjects(enrollment.sectionId);
    const choice = normalizeSubjectChoice(
      dto.subjectIds,
      plan.map((s) => s.id),
    );
    if (choice.invalid.length > 0) fail('enrollment_subject_not_in_section');

    await this.transactionHelper.executeInTransaction(() =>
      this.enrollmentSubjectRepository.replace(id, choice.subjectIds),
    );
    return this.getRosterItem(id, enrollment.academicYearId);
  }

  /**
   * Subject ids an enrollment actually studies. Single source of truth for
   * attendance and grades (E8/E9).
   */
  async getEffectiveSubjects(enrollmentId: number): Promise<number[]> {
    const enrollment = await this.getEnrollment(enrollmentId);
    const [chosen, plan] = await Promise.all([
      this.enrollmentSubjectRepository.findSubjectIds(enrollmentId),
      this.getSectionSubjects(enrollment.sectionId),
    ]);
    return effectiveSubjectIds(
      chosen,
      plan.map((s) => s.id),
    );
  }

  /**
   * Active students of a section who study `subjectId` (same "no choice =
   * all section subjects" rule as getEffectiveSubjects). Used by exams (E9).
   */
  async findStudentsTakingSubject(
    sectionId: number,
    subjectId: number,
  ): Promise<{ id: number; fullName: string; familyName: string | null }[]> {
    const section = await this.getSection(sectionId);
    const [rows, plan] = await Promise.all([
      this.enrollmentRepository.findBySection(
        section.id,
        section.academicYearId,
      ),
      this.getSectionSubjects(section.id),
    ]);
    const planIds = plan.map((s) => s.id);
    return rows
      .filter(
        (row) =>
          row.status === EnrollmentStatus.ACTIVE &&
          effectiveSubjectIds(
            row.subjects.map((s) => s.subjectId),
            planIds,
          ).includes(subjectId),
      )
      .map((row) => ({
        id: row.student.id,
        fullName: row.student.fullName,
        familyName: row.student.family?.familyName ?? null,
      }));
  }

  /** Active enrollments of a year as student → section (dashboard). */
  async getActiveStudentSections(
    academicYearId: number,
    branchId?: number,
  ): Promise<{ studentId: number; sectionId: number }[]> {
    return this.enrollmentRepository.findActiveStudentSections(
      academicYearId,
      branchId,
    );
  }

  /** Enrollments of a year with student / family / contract flag (reports, D3). */
  async getYearEnrollments(filter: {
    academicYearId: number;
    sectionId?: number;
    branchId?: number;
    activeOnly?: boolean;
    withoutContract?: boolean;
    take: number;
  }) {
    return this.enrollmentRepository.findYearForReport(filter);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async getSection(id: number): Promise<Section> {
    const section = await this.sectionRepository.findById(id);
    Ensure.exists(section, 'Section');
    return section;
  }

  private async getEnrollment(id: number): Promise<StudentEnrollment> {
    const enrollment = await this.enrollmentRepository.findById(id);
    Ensure.exists(enrollment, 'Enrollment');
    return enrollment;
  }

  private async getSectionSubjects(sectionId: number): Promise<NamedSubject[]> {
    const rows = (await this.sectionSubjectRepository.findSubjectsBySection(
      sectionId,
    )) as unknown as { subject: NamedSubject }[];
    return rows.map((row) => ({ id: row.subject.id, name: row.subject.name }));
  }

  private async getRosterItem(
    id: number,
    academicYearId: number,
  ): Promise<SectionRosterItem> {
    const row = await this.enrollmentRepository.findRosterRow(
      id,
      academicYearId,
    );
    Ensure.exists(row, 'Enrollment');
    return this.toRosterItem(row, await this.getSectionSubjects(row.sectionId));
  }

  private toRosterItem(
    row: RosterRow,
    plan: NamedSubject[],
  ): SectionRosterItem {
    const takesAllSubjects = row.subjects.length === 0;
    return {
      enrollmentId: row.id,
      sectionId: row.sectionId,
      status: row.status,
      statusReason: row.statusReason,
      enrolledAt: row.enrolledAt,
      student: {
        id: row.student.id,
        fullName: row.student.fullName,
        gender: row.student.gender,
        familyName: row.student.family?.familyName ?? null,
        phone: row.student.family?.phone ?? null,
        status: row.student.status,
      },
      takesAllSubjects,
      subjects: takesAllSubjects ? plan : row.subjects.map((s) => s.subject),
    };
  }
}
