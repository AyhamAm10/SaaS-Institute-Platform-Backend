import { jest } from '@jest/globals';
import { HttpException, NotFoundException } from '@nestjs/common';
import { Prisma, Section } from '@prisma/client';
import { SectionsService } from './sections.service';
import { SectionRepository } from './section.repository';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
import { BranchRepository } from '../branches/branch.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { CreateSectionDto } from './dto/create-section.dto';

describe('SectionsService', () => {
  let service: SectionsService;
  let mockSectionRepo: jest.Mocked<Partial<SectionRepository>>;
  let mockAcademicYearRepo: jest.Mocked<Partial<AcademicYearRepository>>;
  let mockBranchRepo: jest.Mocked<Partial<BranchRepository>>;
  let mockTxHelper: Partial<TransactionHelper>;

  const currentInstituteId = 10;

  const sampleSection: Section = {
    id: 1,
    instituteId: currentInstituteId,
    branchId: 5,
    academicYearId: 2,
    name: 'Section 1A',
    grade: 'Grade 1',
    feeAmount: new Prisma.Decimal(1500.0),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleBranch = {
    id: 5,
    instituteId: currentInstituteId,
    name: 'Main Branch',
    code: 'MAIN',
    phone: '123',
    address: 'Campus 1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleYear = {
    id: 2,
    instituteId: currentInstituteId,
    name: '2026-2027',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2027-06-30'),
    isCurrent: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockSectionRepo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findRawById: jest.fn(),
      findByNameAndBranch: jest.fn(),
      findByIdWithDetails: jest.fn(),
      findAllFiltered: jest.fn(),
      findByAcademicYear: jest.fn(),
    };

    mockAcademicYearRepo = {
      findById: jest.fn(),
      findRawById: jest.fn(),
    };

    mockBranchRepo = {
      findById: jest.fn(),
      findRawById: jest.fn(),
    };

    mockTxHelper = {
      executeInTransaction: jest.fn().mockImplementation((cb: () => Promise<unknown>) => cb()),
    };

    service = new SectionsService(
      mockSectionRepo as SectionRepository,
      mockAcademicYearRepo as AcademicYearRepository,
      mockBranchRepo as BranchRepository,
      mockTxHelper as TransactionHelper,
    );
  });

  describe('create', () => {
    const validDto: CreateSectionDto = {
      name: 'Section 1A',
      grade: 'Grade 1',
      branchId: 5,
      academicYearId: 2,
      feeAmount: 1500.0,
    };

    it('creates a section successfully when all relations and constraints are valid', async () => {
      mockBranchRepo.findById!.mockResolvedValue(sampleBranch as any);
      mockAcademicYearRepo.findById!.mockResolvedValue(sampleYear as any);
      mockSectionRepo.findByNameAndBranch!.mockResolvedValue(null);
      mockSectionRepo.create!.mockResolvedValue(sampleSection);

      const result = await service.create(validDto);

      expect(result).toEqual(sampleSection);
      expect(mockSectionRepo.create).toHaveBeenCalledWith({
        name: validDto.name,
        grade: validDto.grade,
        branchId: validDto.branchId,
        academicYearId: validDto.academicYearId,
        feeAmount: new Prisma.Decimal(validDto.feeAmount),
      });
    });

    it('rejects creation with a negative fee amount', async () => {
      const invalidFeeDto = { ...validDto, feeAmount: -100 };

      await expect(service.create(invalidFeeDto)).rejects.toThrow(HttpException);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the academic year does not exist in the system', async () => {
      mockBranchRepo.findById!.mockResolvedValue(sampleBranch as any);
      mockAcademicYearRepo.findById!.mockResolvedValue(null);
      mockAcademicYearRepo.findRawById!.mockResolvedValue(null);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });

    it('rejects cross-tenant academic year with academic_year_mismatch (400)', async () => {
      mockBranchRepo.findById!.mockResolvedValue(sampleBranch as any);
      // Not found in tenant
      mockAcademicYearRepo.findById!.mockResolvedValue(null);
      // But found globally belonging to another tenant (instituteId 99)
      mockAcademicYearRepo.findRawById!.mockResolvedValue({
        ...sampleYear,
        instituteId: 99,
      } as any);

      await expect(service.create(validDto)).rejects.toThrow(HttpException);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the branch does not exist in the system', async () => {
      mockBranchRepo.findById!.mockResolvedValue(null);
      mockBranchRepo.findRawById!.mockResolvedValue(null);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });

    it('rejects cross-tenant branch reference with branch_mismatch (400)', async () => {
      mockBranchRepo.findById!.mockResolvedValue(null);
      mockBranchRepo.findRawById!.mockResolvedValue({
        ...sampleBranch,
        instituteId: 99,
      } as any);

      await expect(service.create(validDto)).rejects.toThrow(HttpException);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });

    it('rejects duplicate section name within the same branch and academic year (409)', async () => {
      mockBranchRepo.findById!.mockResolvedValue(sampleBranch as any);
      mockAcademicYearRepo.findById!.mockResolvedValue(sampleYear as any);
      mockSectionRepo.findByNameAndBranch!.mockResolvedValue(sampleSection);

      await expect(service.create(validDto)).rejects.toThrow(HttpException);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a section successfully', async () => {
      mockSectionRepo.findById!.mockResolvedValue(sampleSection);
      mockSectionRepo.update!.mockResolvedValue({ ...sampleSection, name: 'Section 1B' });

      const result = await service.update(1, { name: 'Section 1B' });

      expect(result.name).toBe('Section 1B');
      expect(mockSectionRepo.update).toHaveBeenCalledWith(1, { name: 'Section 1B' });
    });

    it('throws NotFoundException when attempting to update a section from another tenant', async () => {
      mockSectionRepo.findById!.mockResolvedValue(null);

      await expect(service.update(999, { name: 'Hack' })).rejects.toThrow(NotFoundException);
      expect(mockSectionRepo.update).not.toHaveBeenCalled();
    });

    it('rejects updating with a negative fee', async () => {
      mockSectionRepo.findById!.mockResolvedValue(sampleSection);

      await expect(service.update(1, { feeAmount: -50 })).rejects.toThrow(HttpException);
      expect(mockSectionRepo.update).not.toHaveBeenCalled();
    });

    it('rejects changing academic year to one belonging to another tenant', async () => {
      mockSectionRepo.findById!.mockResolvedValue(sampleSection);
      mockAcademicYearRepo.findById!.mockResolvedValue(null);
      mockAcademicYearRepo.findRawById!.mockResolvedValue({
        ...sampleYear,
        instituteId: 99,
      } as any);

      await expect(service.update(1, { academicYearId: 999 })).rejects.toThrow(HttpException);
      expect(mockSectionRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('updateFee', () => {
    it('updates section fee amount successfully', async () => {
      mockSectionRepo.findById!.mockResolvedValue(sampleSection);
      mockSectionRepo.update!.mockResolvedValue({
        ...sampleSection,
        feeAmount: new Prisma.Decimal(2000),
      });

      const result = await service.updateFee(1, { feeAmount: 2000 });

      expect(result.feeAmount).toEqual(new Prisma.Decimal(2000));
      expect(mockSectionRepo.update).toHaveBeenCalledWith(1, {
        feeAmount: new Prisma.Decimal(2000),
      });
    });

    it('rejects negative fee in updateFee', async () => {
      await expect(service.updateFee(1, { feeAmount: -10 })).rejects.toThrow(HttpException);
      expect(mockSectionRepo.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if section does not belong to current tenant', async () => {
      mockSectionRepo.findById!.mockResolvedValue(null);

      await expect(service.updateFee(999, { feeAmount: 1000 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDetails', () => {
    it('returns section details with relations and counts', async () => {
      const details = {
        ...sampleSection,
        branch: { id: 5, name: 'Main Branch', code: 'MAIN', address: 'Campus 1' },
        academicYear: { id: 2, name: '2026-2027', startDate: new Date(), endDate: new Date(), isCurrent: true },
        _count: { studentEnrollments: 25, sectionSubjects: 6, sectionTeachers: 4, timetables: 1 },
      };

      mockSectionRepo.findByIdWithDetails!.mockResolvedValue(details as any);

      const result = await service.getDetails(1);

      expect(result).toEqual(details);
      expect(mockSectionRepo.findByIdWithDetails).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException if section is not found in the current tenant', async () => {
      mockSectionRepo.findByIdWithDetails!.mockResolvedValue(null);

      await expect(service.getDetails(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateSectionBelongsToAcademicYear', () => {
    it('returns valid when section belongs to the academic year within the tenant', async () => {
      mockAcademicYearRepo.findById!.mockResolvedValue(sampleYear as any);
      mockSectionRepo.findById!.mockResolvedValue(sampleSection);

      const result = await service.validateSectionBelongsToAcademicYear(1, 2);

      expect(result.valid).toBe(true);
      expect(result.section).toEqual(sampleSection);
    });

    it('throws 400 when section belongs to a different academic year', async () => {
      mockAcademicYearRepo.findById!.mockResolvedValue(sampleYear as any);
      mockSectionRepo.findById!.mockResolvedValue({
        ...sampleSection,
        academicYearId: 99,
      });

      await expect(
        service.validateSectionBelongsToAcademicYear(1, 2),
      ).rejects.toThrow(HttpException);
    });
  });
});
