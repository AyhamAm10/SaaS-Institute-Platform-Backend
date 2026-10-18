import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { StudentsService } from './students.service';
import { StudentRepository } from './student.repository';
import { StudentEnrollmentRepository } from './student-enrollment.repository';
import { FamilyRepository } from '../families/family.repository';
import { StudentFieldRepository } from '../student-fields/student-field.repository';
import { SectionRepository } from '../sections/section.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { RequestContext } from '../../context/request-context';

describe('StudentsService', () => {
  let service: StudentsService;
  let studentRepo: any;
  let enrollmentRepo: any;
  let familyRepo: any;
  let fieldRepo: any;
  let sectionRepo: any;

  const mockStudent = {
    id: 1,
    instituteId: 1,
    branchId: 1,
    familyId: 1,
    fullName: 'أحمد العمر',
    birthDate: new Date('2008-05-15'),
    gender: 'MALE',
    customFields: { blood_type: 'O+' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockStudentRepo = {
      create: jest.fn(),
      findFiltered: jest.fn(),
      findStudentById: jest.fn(),
    };
    const mockEnrollmentRepo = {
      enroll: jest.fn(),
    };
    const mockFamilyRepo = {
      create: jest.fn(),
      findFamilyById: jest.fn(),
    };
    const mockFieldRepo = {
      findAllForTenant: jest.fn().mockResolvedValue([] as any),
    };
    const mockSectionRepo = {
      findRawById: jest.fn(),
    };
    const mockTxHelper = {
      executeInTransaction: jest.fn().mockImplementation((cb: any) => cb()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: StudentRepository, useValue: mockStudentRepo },
        { provide: StudentEnrollmentRepository, useValue: mockEnrollmentRepo },
        { provide: FamilyRepository, useValue: mockFamilyRepo },
        { provide: StudentFieldRepository, useValue: mockFieldRepo },
        { provide: SectionRepository, useValue: mockSectionRepo },
        { provide: TransactionHelper, useValue: mockTxHelper },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
    studentRepo = module.get(StudentRepository);
    enrollmentRepo = module.get(StudentEnrollmentRepository);
    familyRepo = module.get(FamilyRepository);
    fieldRepo = module.get(StudentFieldRepository);
    sectionRepo = module.get(SectionRepository);
  });

  it('creates student with existing family', async () => {
    await RequestContext.run(
      { userId: 1, instituteId: 1, role: 'INSTITUTE_ADMIN', language: 'en' },
      async () => {
        familyRepo.findFamilyById.mockResolvedValue({ id: 1, familyName: 'العمر' });
        studentRepo.create.mockResolvedValue(mockStudent);
        studentRepo.findStudentById.mockResolvedValue(mockStudent);

        const result = await service.create({
          fullName: 'أحمد العمر',
          birthDate: '2008-05-15',
          gender: 'MALE',
          familyId: 1,
          branchId: 1,
          customFields: { blood_type: 'O+' },
        });

        expect(result).toEqual(mockStudent);
        expect(studentRepo.create).toHaveBeenCalled();
      },
    );
  });

  it('creates student with inline new family and enrolls into section', async () => {
    await RequestContext.run(
      { userId: 1, instituteId: 1, role: 'INSTITUTE_ADMIN', language: 'en' },
      async () => {
        familyRepo.create.mockResolvedValue({ id: 2, familyName: 'الخالد' });
        sectionRepo.findRawById.mockResolvedValue({
          id: 10,
          instituteId: 1,
          branchId: 1,
          academicYearId: 5,
        });
        studentRepo.create.mockResolvedValue({ ...mockStudent, id: 2, familyId: 2 });
        studentRepo.findStudentById.mockResolvedValue({ ...mockStudent, id: 2, familyId: 2 });

        const result = await service.create({
          fullName: 'سامي الخالد',
          birthDate: '2009-02-10',
          gender: 'MALE',
          newFamily: {
            familyName: 'الخالد',
            fatherName: 'عمر',
            phone: '0933333333',
          },
          sectionId: 10,
        });

        expect(result.id).toBe(2);
        expect(familyRepo.create).toHaveBeenCalledWith({
          familyName: 'الخالد',
          fatherName: 'عمر',
          motherName: null,
          phone: '0933333333',
        });
        expect(enrollmentRepo.enroll).toHaveBeenCalledWith({
          studentId: 2,
          sectionId: 10,
          academicYearId: 5,
          status: 'ACTIVE',
        });
      },
    );
  });

  it('finds paginated students list', async () => {
    await RequestContext.run(
      { userId: 1, instituteId: 1, role: 'INSTITUTE_ADMIN', language: 'en' },
      async () => {
        studentRepo.findFiltered.mockResolvedValue({
          data: [mockStudent],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        });

        const result = await service.findAll({ page: 1, limit: 20 });
        expect(result.data).toHaveLength(1);
        expect(result.total).toBe(1);
      },
    );
  });
});
