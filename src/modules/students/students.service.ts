import { Inject, Injectable } from '@nestjs/common';
import { EnrollmentStatus, Student } from '@prisma/client';
import {
  MobileStudentOwner,
  MobileStudentRow,
  StudentRepository,
} from './student.repository';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
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
    @Inject(AcademicYearRepository)
    private readonly academicYearRepository: AcademicYearRepository,
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
    await this.validateCustomFields(customFields, { isCreate: true });

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
    const customFilters = await this.validateAndParseCustomFilters(
      query.customFilters,
    );
    return this.studentRepository.findFiltered(
      query,
      await this.contextYearId(),
      customFilters,
    );
  }

  /** Live students a mobile caller owns (see StudentRepository.findForMobile). */
  async findForMobile(
    owner: MobileStudentOwner,
    studentId?: number,
  ): Promise<MobileStudentRow[]> {
    return this.studentRepository.findForMobile(owner, studentId);
  }

  /** Header academic year, else the current one (never created here). */
  private async contextYearId(): Promise<number | null> {
    const headerYearId = RequestContext.getAcademicYearId();
    if (headerYearId) return headerYearId;
    return (await this.academicYearRepository.findCurrentYear())?.id ?? null;
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
          currentCityId: existing.cityId,
          currentSchoolId: existing.schoolId,
          currentStudentId: existing.id,
        },
      ),
    );

    if (dto.customFields !== undefined) {
      await this.validateCustomFields(dto.customFields, { isCreate: false });
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

  private async validateCustomFields(
    payload: Record<string, unknown>,
    { isCreate }: { isCreate: boolean },
  ): Promise<void> {
    const configuredFields = await this.fieldRepository.findAllForTenant(false);
    const fieldsMap = new Map(configuredFields.map((f) => [f.name, f]));

    for (const [key, val] of Object.entries(payload)) {
      const field = fieldsMap.get(key);
      Ensure.custom(
        !field,
        ErrorMessages.get('custom_field_unknown', { field: key }),
        400,
      );

      if (val === undefined || val === null || val === '') {
        continue;
      }

      if (field!.type === 'NUMBER') {
        const isNum =
          typeof val === 'number'
            ? !Number.isNaN(val)
            : typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val.trim());
        Ensure.custom(
          !isNum,
          ErrorMessages.get('custom_field_invalid_number', {
            field: field!.label,
          }),
          400,
        );
      } else if (field!.type === 'DATE') {
        const isDate =
          typeof val === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(val) &&
          !Number.isNaN(Date.parse(val));
        Ensure.custom(
          !isDate,
          ErrorMessages.get('custom_field_invalid_date', {
            field: field!.label,
          }),
          400,
        );
      } else if (field!.type === 'BOOLEAN') {
        const isBool =
          typeof val === 'boolean' || val === 'true' || val === 'false';
        Ensure.custom(
          !isBool,
          ErrorMessages.get('custom_field_invalid_boolean', {
            field: field!.label,
          }),
          400,
        );
      } else if (field!.type === 'SELECT') {
        const options = Array.isArray(field!.options)
          ? (field!.options as string[])
          : [];
        Ensure.custom(
          typeof val !== 'string' || !options.includes(val),
          ErrorMessages.get('custom_field_invalid_option', {
            field: field!.label,
            value: String(val),
          }),
          400,
        );
      } else if (field!.type === 'TEXT') {
        Ensure.custom(
          typeof val !== 'string',
          ErrorMessages.get('custom_field_invalid_text', {
            field: field!.label,
          }),
          400,
        );
      }
    }

    if (isCreate) {
      await this.assertRequiredCustomFields(payload);
    }
  }

  private async validateAndParseCustomFilters(
    raw?: string,
  ): Promise<Record<string, unknown> | undefined> {
    if (!raw || !raw.trim()) return undefined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      Ensure.custom(
        true,
        ErrorMessages.get('custom_filters_invalid_json'),
        400,
      );
    }

    Ensure.custom(
      !parsed || typeof parsed !== 'object' || Array.isArray(parsed),
      ErrorMessages.get('custom_filters_invalid_json'),
      400,
    );

    const configuredFields = await this.fieldRepository.findAllForTenant(false);
    const fieldsMap = new Map(configuredFields.map((f) => [f.name, f]));
    const normalized: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      const field = fieldsMap.get(key);
      Ensure.custom(
        !field,
        ErrorMessages.get('custom_field_unknown', { field: key }),
        400,
      );
      Ensure.custom(
        !field!.isFilterable,
        ErrorMessages.get('custom_field_not_filterable', {
          field: field!.label,
        }),
        400,
      );

      if (field!.type === 'SELECT') {
        const options = Array.isArray(field!.options)
          ? (field!.options as string[])
          : [];
        Ensure.custom(
          typeof val !== 'string' || !options.includes(val),
          ErrorMessages.get('custom_field_invalid_option', {
            field: field!.label,
            value: String(val),
          }),
          400,
        );
        normalized[key] = val;
      } else if (field!.type === 'BOOLEAN') {
        Ensure.custom(
          typeof val !== 'boolean' && val !== 'true' && val !== 'false',
          ErrorMessages.get('custom_field_invalid_boolean', {
            field: field!.label,
          }),
          400,
        );
        normalized[key] = typeof val === 'boolean' ? val : val === 'true';
      } else {
        Ensure.custom(
          true,
          ErrorMessages.get('custom_field_not_filterable', {
            field: field!.label,
          }),
          400,
        );
      }
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }
}
