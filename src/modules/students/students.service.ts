import { Inject, Injectable } from '@nestjs/common';
import { Student } from '@prisma/client';
import { StudentRepository } from './student.repository';
import { StudentEnrollmentRepository } from './student-enrollment.repository';
import { FamilyRepository } from '../families/family.repository';
import { StudentFieldRepository } from '../student-fields/student-field.repository';
import { SectionRepository } from '../sections/section.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { RequestContext } from '../../context/request-context';
import { Ensure } from '../../common/errors/ensure';
import { CreateStudentDto } from './dto/create-student.dto';
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
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
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
    const configuredFields = await this.fieldRepository.findAllForTenant(false);
    const customFields = dto.customFields || {};

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

      let branchId = dto.branchId || RequestContext.getBranchId() || null;
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

      const student = await this.studentRepository.create({
        fullName: dto.fullName.trim(),
        birthDate: new Date(dto.birthDate),
        gender: dto.gender,
        familyId: familyId!,
        branchId,
        customFields,
      });

      if (section) {
        await this.enrollmentRepository.enroll({
          studentId: student.id,
          sectionId: section.id,
          academicYearId: section.academicYearId,
          status: 'ACTIVE',
        });
      }

      return this.studentRepository.findStudentById(student.id);
    });
  }

  async findAll(query: StudentQueryDto): Promise<PaginatedResult<any>> {
    return this.studentRepository.findFiltered(query);
  }

  async findById(id: number): Promise<any> {
    const student = await this.studentRepository.findStudentById(id);
    Ensure.exists(student, 'Student');
    return student;
  }
}
