import { jest } from '@jest/globals';
import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { AcademicBranch } from '@prisma/client';
import { AcademicBranchesService, DEFAULT_ACADEMIC_BRANCHES } from './academic-branches.service';
import { AcademicBranchRepository } from './academic-branch.repository';
import { TransactionHelper } from '../../database/transaction.helper';

describe('AcademicBranchesService', () => {
  let service: AcademicBranchesService;
  let mockBranchRepo: jest.Mocked<Partial<AcademicBranchRepository>>;
  let mockTxHelper: Partial<TransactionHelper>;

  const currentInstituteId = 10;

  const sampleBranch: AcademicBranch = {
    id: 1,
    instituteId: currentInstituteId,
    name: 'الصف التاسع',
    code: 'G9',
    description: 'المرحلة الإعدادية',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockBranchRepo = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findById: jest.fn(),
      findRawById: jest.fn(),
      findByName: jest.fn(),
      findAllPaginated: jest.fn(),
      countSections: jest.fn(),
    };

    mockTxHelper = {
      executeInTransaction: jest.fn().mockImplementation((cb: () => Promise<unknown>) => cb()),
    };

    service = new AcademicBranchesService(
      mockBranchRepo as AcademicBranchRepository,
      mockTxHelper as TransactionHelper,
    );
  });

  describe('provisionDefaultBranches', () => {
    it('provisions all 3 Arabic default branches if they do not exist', async () => {
      const mockClient = {
        academicBranch: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }: any) => ({
            id: Math.floor(Math.random() * 100),
            ...data,
          })),
        },
      };

      (mockBranchRepo as any).client = mockClient;

      const branches = await service.provisionDefaultBranches(currentInstituteId);

      expect(branches).toHaveLength(3);
      expect(mockClient.academicBranch.create).toHaveBeenCalledTimes(3);
      expect(mockClient.academicBranch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          instituteId: currentInstituteId,
          name: DEFAULT_ACADEMIC_BRANCHES[0].name,
        }),
      });
    });
  });

  describe('create', () => {
    it('creates an academic branch successfully within the tenant', async () => {
      mockBranchRepo.findByName!.mockResolvedValue(null);
      mockBranchRepo.create!.mockResolvedValue(sampleBranch);

      const result = await service.create({
        name: 'الصف التاسع',
        code: 'G9',
      });

      expect(result).toEqual(sampleBranch);
      expect(mockBranchRepo.create).toHaveBeenCalledWith({
        name: 'الصف التاسع',
        code: 'G9',
        description: null,
      });
    });

    it('rejects duplicate branch name in the same institute with 409', async () => {
      mockBranchRepo.findByName!.mockResolvedValue(sampleBranch);

      await expect(
        service.create({ name: 'الصف التاسع' }),
      ).rejects.toThrow(HttpException);
      expect(mockBranchRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates branch name and code', async () => {
      mockBranchRepo.findById!.mockResolvedValue(sampleBranch);
      mockBranchRepo.findByName!.mockResolvedValue(null);
      mockBranchRepo.update!.mockResolvedValue({
        ...sampleBranch,
        name: 'الصف التاسع المعدل',
      });

      const result = await service.update(1, { name: 'الصف التاسع المعدل' });

      expect(result.name).toBe('الصف التاسع المعدل');
      expect(mockBranchRepo.update).toHaveBeenCalledWith(1, {
        name: 'الصف التاسع المعدل',
      });
    });

    it('throws NotFoundException if branch does not belong to tenant', async () => {
      mockBranchRepo.findById!.mockResolvedValue(null);

      await expect(service.update(999, { name: 'Other' })).rejects.toThrow(NotFoundException);
      expect(mockBranchRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes branch when no sections are linked', async () => {
      mockBranchRepo.findById!.mockResolvedValue(sampleBranch);
      mockBranchRepo.countSections!.mockResolvedValue(0);
      mockBranchRepo.delete!.mockResolvedValue(sampleBranch);

      await service.delete(1);

      expect(mockBranchRepo.delete).toHaveBeenCalledWith(1);
    });

    it('rejects deletion when sections are linked to this branch (400)', async () => {
      mockBranchRepo.findById!.mockResolvedValue(sampleBranch);
      mockBranchRepo.countSections!.mockResolvedValue(3);

      await expect(service.delete(1)).rejects.toThrow(HttpException);
      expect(mockBranchRepo.delete).not.toHaveBeenCalled();
    });
  });
});
