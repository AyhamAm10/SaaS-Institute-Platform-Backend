import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { TeachersService } from './teachers.service';
import { TeacherRepository } from './teacher.repository';
import { TeacherAssignmentRepository } from './teacher-assignment.repository';
import { TeacherAvailabilityRepository } from './teacher-availability.repository';
import { UserSystemRepository } from '../users/user-system.repository';
import { AcademicBranchRepository } from '../academic-branches/academic-branch.repository';
import { SubjectRepository } from '../subjects/subject.repository';
import { BranchRepository } from '../branches/branch.repository';
import { TransactionHelper } from '../../database/transaction.helper';

describe('TeachersService', () => {
  let service: TeachersService;
  let mockTeacherRepo: any;
  let mockAssignmentRepo: any;
  let mockAvailabilityRepo: any;
  let mockUserSystemRepo: any;
  let mockAcademicBranchRepo: any;
  let mockSubjectRepo: any;
  let mockBranchRepo: any;
  let mockTransactionHelper: any;

  beforeEach(async () => {
    mockTeacherRepo = {
      getInstituteId: jest.fn().mockReturnValue(1),
      findById: jest.fn(),
      findByIdWithDetails: jest.fn(),
      findAllFiltered: jest.fn(),
      update: jest.fn(),
      client: {
        user: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
        teacher: { create: jest.fn() },
        branchTeacher: { create: jest.fn(), deleteMany: jest.fn() },
        teacherAssignment: { create: jest.fn() },
        teacherAvailability: { createMany: jest.fn() },
      },
    };

    mockAssignmentRepo = {
      findByTeacherBranchSubject: jest.fn(),
      findByTeacher: jest.fn(),
      create: jest.fn(),
      deleteAssignment: jest.fn(),
    };

    mockAvailabilityRepo = {
      findByTeacher: jest.fn(),
      replaceAvailabilities: jest.fn(),
    };

    mockUserSystemRepo = {
      findByPhone: jest.fn(),
    };

    mockAcademicBranchRepo = {
      findById: jest.fn(),
      findRawById: jest.fn(),
    };

    mockSubjectRepo = {
      findById: jest.fn(),
      findRawById: jest.fn(),
    };

    mockBranchRepo = {
      findById: jest.fn(),
    };

    mockTransactionHelper = {
      executeInTransaction: jest.fn().mockImplementation((fn) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: TeacherRepository, useValue: mockTeacherRepo },
        { provide: TeacherAssignmentRepository, useValue: mockAssignmentRepo },
        { provide: TeacherAvailabilityRepository, useValue: mockAvailabilityRepo },
        { provide: UserSystemRepository, useValue: mockUserSystemRepo },
        { provide: AcademicBranchRepository, useValue: mockAcademicBranchRepo },
        { provide: SubjectRepository, useValue: mockSubjectRepo },
        { provide: BranchRepository, useValue: mockBranchRepo },
        { provide: TransactionHelper, useValue: mockTransactionHelper },
      ],
    }).compile();

    service = module.get<TeachersService>(TeachersService);
  });

  describe('create', () => {
    it('should throw 409 if phone already exists in system', async () => {
      mockUserSystemRepo.findByPhone.mockResolvedValue({ id: 99, phone: '+966512345678' });

      await expect(
        service.create({
          fullName: 'Ahmed Teacher',
          phone: '+966512345678',
        }),
      ).rejects.toThrow();
    });

    it('should throw 400 if availability window has invalid time range', async () => {
      mockUserSystemRepo.findByPhone.mockResolvedValue(null);

      await expect(
        service.create({
          fullName: 'Ahmed Teacher',
          phone: '+966512345678',
          availabilities: [
            { dayOfWeek: 0, startTime: '12:00', endTime: '08:00' },
          ],
        }),
      ).rejects.toThrow();
    });

    it('should throw 400 if availability windows overlap', async () => {
      mockUserSystemRepo.findByPhone.mockResolvedValue(null);

      await expect(
        service.create({
          fullName: 'Ahmed Teacher',
          phone: '+966512345678',
          availabilities: [
            { dayOfWeek: 0, startTime: '08:00', endTime: '11:00' },
            { dayOfWeek: 0, startTime: '10:30', endTime: '13:00' },
          ],
        }),
      ).rejects.toThrow();
    });

    it('should create user and teacher successfully', async () => {
      mockUserSystemRepo.findByPhone.mockResolvedValue(null);
      mockTeacherRepo.client.user.create.mockResolvedValue({ id: 10, fullName: 'Ahmed Teacher' });
      mockTeacherRepo.client.teacher.create.mockResolvedValue({ id: 1, userId: 10 });
      mockTeacherRepo.findByIdWithDetails.mockResolvedValue({ id: 1, userId: 10, user: { fullName: 'Ahmed Teacher' } });

      const result = await service.create({
        fullName: 'Ahmed Teacher',
        phone: '+966512345678',
      });

      expect(result).toBeDefined();
      expect(mockTeacherRepo.client.user.create).toHaveBeenCalled();
      expect(mockTeacherRepo.client.teacher.create).toHaveBeenCalled();
    });
  });

  describe('assignQualification', () => {
    it('should throw 409 if assignment already exists', async () => {
      mockTeacherRepo.findById.mockResolvedValue({ id: 1 });
      mockAcademicBranchRepo.findById.mockResolvedValue({ id: 2 });
      mockSubjectRepo.findById.mockResolvedValue({ id: 3 });
      mockAssignmentRepo.findByTeacherBranchSubject.mockResolvedValue({ id: 10 });

      await expect(
        service.assignQualification(1, { academicBranchId: 2, subjectId: 3 }),
      ).rejects.toThrow();
    });

    it('should create assignment when valid', async () => {
      mockTeacherRepo.findById.mockResolvedValue({ id: 1 });
      mockAcademicBranchRepo.findById.mockResolvedValue({ id: 2 });
      mockSubjectRepo.findById.mockResolvedValue({ id: 3 });
      mockAssignmentRepo.findByTeacherBranchSubject.mockResolvedValue(null);
      mockAssignmentRepo.create.mockResolvedValue({ id: 11, teacherId: 1, academicBranchId: 2, subjectId: 3 });

      const res = await service.assignQualification(1, { academicBranchId: 2, subjectId: 3 });
      expect(res.id).toBe(11);
    });
  });
});
