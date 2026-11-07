import { Inject, Injectable } from '@nestjs/common';
import { EnrollmentStatus, Student } from '@prisma/client';
import { StudentRepository } from './student.repository';
import { StudentEnrollmentRepository } from './student-enrollment.repository';
import { FamilyRepository } from '../families/family.repository';
import { StudentFieldRepository } from '../student-fields/student-field.repository';
import { SectionRepository } from '../sections/section.repository';
import { BranchRepository } from '../branches/branch.repository';
import { StudentReferencesResolver } from './student-references.resolver';
import { TransactionHelper } from '../../database/transaction.helper';
import { RequestContext } from '../../context/request-context';
import { Ensure } from '../../common/errors/ensure';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentDeletionReport } from './dto/student-deletion-report.dto';
import { ErrorMessages } from '../../common/errors/error-messages';
import { StudentQueryDto } from './dto/student-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

@Injectable()
export class StudentsService {
  constructor(
    @Inject(StudentRepository)
    private readonly studentRepository: StudentRepository,
    @Inject(StudentEnrollmentRepository)
    private readonly enrollmentRepository: StudentEnrollmentRepository,
    @Inject(FamilyRepository)
    private readonly familyRepository: FamilyRepository,
    @Inject(StudentFieldRepository)
    private readonly fieldRepository: StudentFieldRepository,
    @Inject(SectionRepository)
    private readonly sectionRepository: SectionRepository,
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
    @Inject(StudentReferencesResolver)
    private readonly referencesResolver: StudentReferencesResolver,
  ) {}

  async create(dto: CreateStudentDto): Promise<Student> {
    Ensure.required(dto.fullName?.trim(), 'fullName');
    Ensure.required(dto.birthDate, 'birthDate');
    Ensure.required(dto.gender, 'gender');

    // Family is mandatory: either existing familyId or newFamily payload
    const hasFamily =
      Boolean(dto.familyId) || Boolean(dto.newFamily?.familyName?.trim());
    Ensure.custom(
      !hasFamily,
      'Either familyId or newFamily must be provided',
      400,
    );

    // Validate custom fields requirements
    const customFields = dto.customFields || {};
    await this.assertRequiredCustomFields(customFields);

    return this.transactionHelper.executeInTransaction(async () => {
      let familyId = dto.familyId;

      if (!familyId && dto.newFamily) {
        const family = await this.familyRepository.create({
          familyName: dto.newFamily.familyName.trim(),
          fatherName: dto.newFamily.fatherName?.trim() || null,
          motherName: dto.newFamily.motherName?.trim() || null,
          phone: dto.newFamily.phone?.trim() || null,
        });
        familyId = family.id;
      } else if (familyId) {
        const existingFamily =
          await this.familyRepository.findFamilyById(familyId);
        Ensure.exists(existingFamily, 'Family');
      }

      let branchId = dto.branchId ?? RequestContext.getBranchId();
      let section: any = null;

      if (dto.sectionId) {
        section = await this.sectionRepository.findRawById(dto.sectionId);
        Ensure.exists(section, 'Section');
        Ensure.custom(
          section.instituteId !== RequestContext.getInstituteId(),
          'Section does not belong to this institute',
          400,
        );
        branchId = section.branchId;
      }

      // Student branch is mandatory: fall back to the default branch (role.md §9.3)
      if (!branchId) {
        branchId = (await this.branchRepository.getOrCreateDefaultBranch()).id;
      } else if (!section) {
        Ensure.exists(await this.branchRepository.findById(branchId), 'Branch');
      }

      const references = await this.referencesResolver.resolve(dto, branchId, {
        isCreate: true,
      });

      const student = await this.studentRepository.create({
        fullName: dto.fullName.trim(),
        birthDate: new Date(dto.birthDate),
        gender: dto.gender,
        familyId: familyId!,
        branchId,
        customFields,
        ...references,
      });

      if (section) {
        await this.enrollmentRepository.enroll({
          studentId: student.id,
          sectionId: section.id,
          academicYearId: section.academicYearId,
          status: EnrollmentStatus.ACTIVE,
        });
      }

      return this.studentRepository.findStudentById(student.id);
    });
  }

  async findAll(query: StudentQueryDto): Promise<PaginatedResult<any>> {
    return this.studentRepository.findFiltered(query);
  }

  /**
   * Dashboard counters (branch from the header): students without a section
   * in the year, and students registered since `newSince`.
   */
  async getOverview(
    academicYearId: number | null,
    newSince: Date,
  ): Promise<{ unassigned: number; newSince: number }> {
    const [unassigned, created] = await Promise.all([
      academicYearId
        ? this.studentRepository.countUnassigned(academicYearId)
        : Promise.resolve(0),
      this.studentRepository.countCreatedSince(newSince),
    ]);
    return { unassigned, newSince: created };
  }

  async findById(id: number): Promise<any> {
    const student = await this.studentRepository.findStudentById(id);
    Ensure.exists(student, 'Student');
    return student;
  }

  /**
   * Update a student's profile. Section moves are enrollment operations and
   * are not handled here.
   */
  async update(id: number, dto: UpdateStudentDto): Promise<any> {
    const existing = await this.findById(id);
    this.assertStudentInActiveBranch(existing);

    const data: Record<string, unknown> = {};

    if (dto.fullName !== undefined) {
      Ensure.required(dto.fullName.trim(), 'fullName');
      data['fullName'] = dto.fullName.trim();
    }
    if (dto.birthDate !== undefined)
      data['birthDate'] = new Date(dto.birthDate);
    if (dto.gender !== undefined) data['gender'] = dto.gender;

    if (dto.familyId !== undefined && dto.familyId !== existing.familyId) {
      Ensure.exists(
        await this.familyRepository.findFamilyById(dto.familyId),
        'Family',
      );
      data['familyId'] = dto.familyId;
    }

    if (dto.branchId !== undefined && dto.branchId !== existing.branchId) {
      Ensure.exists(
        await this.branchRepository.findById(dto.branchId),
        'Branch',
      );
      // A student cannot leave the branch of a section they are enrolled in
      const enrolledElsewhere = (existing.studentEnrollments ?? []).some(
        (e: { status: string; section: { branchId: number } }) =>
          e.status === EnrollmentStatus.ACTIVE &&
          e.section.branchId !== dto.branchId,
      );
      Ensure.custom(
        enrolledElsewhere,
        ErrorMessages.get('student_enrolled_in_other_branch'),
        400,
      );
      data['branchId'] = dto.branchId;
    }

    Object.assign(
      data,
      await this.referencesResolver.resolve(
        dto,
        dto.branchId ?? existing.branchId,
        {
          currentBusId: existing.busId,
        },
      ),
    );

    if (dto.customFields !== undefined) {
      const merged = {
        ...(existing.customFields as Record<string, unknown>),
        ...dto.customFields,
      };
      await this.assertRequiredCustomFields(merged);
      data['customFields'] = merged;
    }

    if (Object.keys(data).length > 0) {
      await this.studentRepository.update(id, data);
    }
    return this.findById(id);
  }

  /** What is attached to the student — shown before deletion. */
  async getDeletionReport(id: number): Promise<StudentDeletionReport> {
    await this.findById(id);
    return this.studentRepository.getDeletionReport(id);
  }

  /** Soft-delete a student. Related history is kept. */
  async delete(id: number): Promise<void> {
    const existing = await this.findById(id);
    this.assertStudentInActiveBranch(existing);
    await this.studentRepository.delete(id);
  }

  /** role.md §4.3 Rule 2 — no mutation of another branch's student. */
  private assertStudentInActiveBranch(student: { branchId: number }): void {
    const contextBranchId = RequestContext.getBranchId();
    Ensure.custom(
      Boolean(contextBranchId && student.branchId !== contextBranchId),
      ErrorMessages.get('student_branch_mismatch'),
      400,
    );
  }

  private async assertRequiredCustomFields(
    customFields: Record<string, unknown>,
  ): Promise<void> {
    const configuredFields = await this.fieldRepository.findAllForTenant(false);
    for (const field of configuredFields) {
      if (field.isRequired) {
        const val = customFields[field.name];
        Ensure.custom(
          val === undefined || val === null || String(val).trim() === '',
          `Field "${field.label}" is required`,
          400,
        );
      }
    }
  }
}
