import { jest } from '@jest/globals';
import { BranchesService } from './branches.service';
import { BranchRepository } from './branch.repository';
import { HttpException } from '@nestjs/common';

describe('BranchesService', () => {
  let service: BranchesService;
  let branchRepository: jest.Mocked<BranchRepository>;

  const mockBranch = {
    id: 1,
    instituteId: 10,
    name: 'الفرع الرئيسي',
    code: 'MAIN',
    phone: '0112345678',
    address: 'شارع الملك فهد',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    branchRepository = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getOrCreateDefaultBranch: jest.fn(),
    } as any;

    service = new BranchesService(branchRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns existing active branches', async () => {
      (branchRepository.findMany as any).mockResolvedValue([mockBranch]);

      const result = await service.findAll();
      expect(result).toEqual([mockBranch]);
      expect(branchRepository.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      });
    });

    it('creates default branch if no branches exist', async () => {
      (branchRepository.findMany as any).mockResolvedValue([]);
      (branchRepository.getOrCreateDefaultBranch as any).mockResolvedValue(
        mockBranch,
      );

      const result = await service.findAll();
      expect(result).toEqual([mockBranch]);
      expect(branchRepository.getOrCreateDefaultBranch).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('successfully creates a new branch', async () => {
      (branchRepository.findOne as any).mockResolvedValue(null);
      (branchRepository.create as any).mockResolvedValue({
        ...mockBranch,
        id: 2,
        name: 'فرع الميدان',
        code: 'MIDAN',
      });

      const result = await service.create({
        name: 'فرع الميدان',
        code: 'MIDAN',
        phone: '0119876543',
        address: 'حي الميدان',
      });

      expect(result.id).toBe(2);
      expect(branchRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'فرع الميدان',
          code: 'MIDAN',
          isActive: true,
        }),
      );
    });

    it('throws 409 if branch name already exists', async () => {
      (branchRepository.findOne as any).mockResolvedValueOnce(mockBranch);

      await expect(
        service.create({
          name: 'الفرع الرئيسي',
          code: 'MAIN2',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 409 if branch code already exists', async () => {
      (branchRepository.findOne as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockBranch);

      await expect(
        service.create({
          name: 'فرع جديد',
          code: 'MAIN',
        }),
      ).rejects.toThrow(HttpException);
    });
  });
});
