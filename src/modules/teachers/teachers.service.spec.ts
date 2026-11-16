import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { TeachersService } from './teachers.service';
import { TeacherRepository } from './teacher.repository';
import { TeacherAssignmentRepository } from './teacher-assignment.repository';
import { TeacherAvailabilityRepository } from './teacher-availability.repository';
import { UserRepository } from '../users/user.repository';
import { AcademicBranchRepository } from '../academic-branches/academic-branch.repository';
import { SubjectRepository } from '../subjects/subject.repository';
import { BranchRepository } from '../branches/branch.repository';
import { AuthService } from '../auth/auth.service';
import { AccountProvisioningService } from '../users/account-provisioning.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { RequestContext } from '../../context/request-context';

describe('TeachersService', () => {
  let service: TeachersService;
  let mockTeacherRepo: any;
  let mockAssignmentRepo: any;
  let mockAvailabilityRepo: any;
  let mockUserSystemRepo: any;
  let mockAcademicBranchRepo: any;
  let mockSubjectRepo: any;
  let mockBranchRepo: any;
  let mockAuthService: any;
  let mockTransactionHelper: any;
  let mockProvisioning: any;

  beforeEach(async () => {
    mockTeacherRepo = {
      getInstituteId: jest.fn().mockReturnValue(1),
      findById: jest.fn(),
      findByIdWithDetails: jest.fn(),
      findAllFiltered: jest.fn(),
      findByUserId: jest.fn(),
      findByUser: jest.fn(),
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
      update: jest.fn(),
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
      findById: jest.fn().mockResolvedValue({ id: 5 } as any),
      getOrCreateDefaultBranch: jest.fn().mockResolvedValue({ id: 5 } as any),
    };

    mockProvisioning = {
      provision: jest.fn(),
    };

    mockAuthService = {
      logout: jest.fn().mockResolvedValue(undefined as any),
    };

    mockTransactionHelper = {
      executeInTransaction: (jest.fn() as any).mockImplementation((fn: any) =>
        fn(),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: TeacherRepository, useValue: mockTeacherRepo },
        { provide: TeacherAssignmentRepository, useValue: mockAssignmentRepo },
        {
          provide: TeacherAvailabilityRepository,
          useValue: mockAvailabilityRepo,
        },
        { provide: UserRepository, useValue: mockUserSystemRepo },
        { provide: AcademicBranchRepository, useValue: mockAcademicBranchRepo },
        { provide: SubjectRepository, useValue: mockSubjectRepo },
        { provide: BranchRepository, useValue: mockBranchRepo },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AccountProvisioningService, useValue: mockProvisioning },
        { provide: TransactionHelper, useValue: mockTransactionHelper },
      ],
    }).compile();

    service = module.get<TeachersService>(TeachersService);
  });

  describe('create', () => {
    it('should throw 409 if phone already exists in system', async () => {
      mockUserSystemRepo.findByPhone.mockResolvedValue({
        id: 99,
        phone: '+966512345678',
      });

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
      mockProvisioning.provision.mockResolvedValue({
        id: 10,
        fullName: 'Ahmed Teacher',
      });
      mockTeacherRepo.client.teacher.create.mockResolvedValue({
        id: 1,
        userId: 10,
      });
      mockTeacherRepo.findByIdWithDetails.mockResolvedValue({
        id: 1,
        userId: 10,
        user: { fullName: 'Ahmed Teacher' },
      });

      const result = await service.create({
        fullName: 'Ahmed Teacher',
        phone: '+966512345678',
      });

      expect(result).toBeDefined();
      expect(mockProvisioning.provision).toHaveBeenCalledWith({
        fullName: 'Ahmed Teacher',
        phone: '+966512345678',
        role: 'TEACHER',
      });
      expect(mockTeacherRepo.client.teacher.create).toHaveBeenCalled();
      expect(mockBranchRepo.getOrCreateDefaultBranch).toHaveBeenCalled();
      expect(mockTeacherRepo.client.branchTeacher.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 5 }),
        }),
      );
    });

    it('should assign context branchId from RequestContext when dto.branchIds is omitted', async () => {
      mockUserSystemRepo.findByPhone.mockResolvedValue(null);
      mockProvisioning.provision.mockResolvedValue({
        id: 10,
        fullName: 'Branch Teacher',
      });
      mockTeacherRepo.client.teacher.create.mockResolvedValue({
        id: 1,
        userId: 10,
      });
      mockTeacherRepo.findByIdWithDetails.mockResolvedValue({
        id: 1,
        userId: 10,
        user: { fullName: 'Branch Teacher' },
      });
      mockBranchRepo.findById.mockResolvedValue({ id: 77 } as any);

      await RequestContext.run(
        {
          userId: 1,
          instituteId: 1,
          role: 'ADMIN',
          language: 'ar',
          branchId: 77,
        },
        async () => {
          await service.create({
            fullName: 'Branch Teacher',
            phone: '+966512345679',
            });
          expect(mockBranchRepo.findById).toHaveBeenCalledWith(77);
          expect(
            mockTeacherRepo.client.branchTeacher.create,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({ branchId: 77 }),
            }),
          );
        },
      );
    });
  });

  describe('assignQualification', () => {
    it('should throw 409 if assignment already exists', async () => {
      mockTeacherRepo.findById.mockResolvedValue({ id: 1 });
      mockAcademicBranchRepo.findById.mockResolvedValue({ id: 2 });
      mockSubjectRepo.findById.mockResolvedValue({ id: 3 });
      mockAssignmentRepo.findByTeacherBranchSubject.mockResolvedValue({
        id: 10,
      });

      await expect(
        service.assignQualification(1, { academicBranchId: 2, subjectId: 3 }),
      ).rejects.toThrow();
    });

    it('should create assignment when valid', async () => {
      mockTeacherRepo.findById.mockResolvedValue({ id: 1 });
      mockAcademicBranchRepo.findById.mockResolvedValue({ id: 2 });
      mockSubjectRepo.findById.mockResolvedValue({ id: 3 });
      mockAssignmentRepo.findByTeacherBranchSubject.mockResolvedValue(null);
      mockAssignmentRepo.create.mockResolvedValue({
        id: 11,
        teacherId: 1,
        academicBranchId: 2,
        subjectId: 3,
      });

      const res = await service.assignQualification(1, {
        academicBranchId: 2,
        subjectId: 3,
      });
      expect(res.id).toBe(11);
    });
  });

  describe('teacher privacy (a TEACHER reaches only their own record)', () => {
    const asTeacher = <T>(fn: () => Promise<T>) =>
      RequestContext.run(
        { userId: 42, instituteId: 1, role: 'TEACHER', language: 'ar' },
        fn,
      );
    const asAdmin = <T>(fn: () => Promise<T>) =>
      RequestContext.run(
        { userId: 1, instituteId: 1, role: 'INSTITUTE_ADMIN', language: 'ar' },
        fn,
      );

    beforeEach(() => {
      mockTeacherRepo.findByUserId.mockResolvedValue({ id: 5, userId: 42 });
      mockTeacherRepo.findByIdWithDetails.mockResolvedValue({ id: 5 });
      mockTeacherRepo.findAllFiltered.mockResolvedValue({ data: [] });
    });

    it('lists only the teacher themself', async () => {
      await asTeacher(() => service.findAll({} as any));
      expect(mockTeacherRepo.findAllFiltered).toHaveBeenCalledWith({}, 5);
    });

    it('lists everyone for staff', async () => {
      await asAdmin(() => service.findAll({} as any));
      expect(mockTeacherRepo.findAllFiltered).toHaveBeenCalledWith({}, undefined);
    });

    it('lets a teacher read their own record', async () => {
      expect(await asTeacher(() => service.findById(5))).toEqual({ id: 5 });
    });

    it('answers 404 when a teacher asks for a colleague', async () => {
      await expect(asTeacher(() => service.findById(6))).rejects.toThrow();
      expect(mockTeacherRepo.findByIdWithDetails).not.toHaveBeenCalled();
      await expect(asTeacher(() => service.getAvailability(6))).rejects.toThrow();
    });

    it('lets staff read any teacher', async () => {
      await asAdmin(() => service.findById(6));
      expect(mockTeacherRepo.findByIdWithDetails).toHaveBeenCalledWith(6);
    });
  });

  describe('deactivation', () => {
    it('ends the sessions of a deactivated teacher', async () => {
      mockTeacherRepo.findById.mockResolvedValue({ id: 5, userId: 42 });
      mockTeacherRepo.update.mockResolvedValue({ id: 5, isActive: false });
      await service.toggleActive(5, false);
      expect(mockAuthService.logout).toHaveBeenCalledWith(42);
      // the login switch follows the teacher switch
      expect(mockUserSystemRepo.update).toHaveBeenCalledWith(42, { isActive: false });
    });

    it('keeps the sessions when a teacher is activated', async () => {
      mockAuthService.logout.mockClear();
      mockTeacherRepo.findById.mockResolvedValue({ id: 5, userId: 42 });
      mockTeacherRepo.update.mockResolvedValue({ id: 5, isActive: true });
      await service.toggleActive(5, true);
      expect(mockAuthService.logout).not.toHaveBeenCalled();
    });
  });
});
