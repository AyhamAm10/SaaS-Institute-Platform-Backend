import { jest } from '@jest/globals';
import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { AcademicYearsService } from './academic-years.service';
import { AcademicYearRepository } from './academic-year.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { AcademicYear } from '@prisma/client';

describe('AcademicYearsService', () => {
  let service: AcademicYearsService;
  let mockRepo: jest.Mocked<Partial<AcademicYearRepository>>;
  let mockTxHelper: Partial<TransactionHelper>;

  const sampleYear: AcademicYear = {
    id: 1,
    instituteId: 10,
    name: '2026-2027',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2027-06-30'),
    isCurrent: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      findOverlapping: jest.fn(),
      unsetCurrentYear: jest.fn(),
      lockInstituteForUpdate: jest.fn(),
      findAllPaginated: jest.fn(),
      findSections: jest.fn(),
    };

    mockTxHelper = {
      executeInTransaction: jest.fn().mockImplementation((cb: () => Promise<unknown>) => cb()),
    };

    service = new AcademicYearsService(
      mockRepo as AcademicYearRepository,
      mockTxHelper as TransactionHelper,
    );
  });

  describe('create', () => {
    const validDto: CreateAcademicYearDto = {
      name: '2026-2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
      isCurrent: false,
    };

    it('creates an academic year successfully', async () => {
      mockRepo.findByName!.mockResolvedValue(null);
      mockRepo.findOverlapping!.mockResolvedValue(null);
      mockRepo.create!.mockResolvedValue(sampleYear);

      const result = await service.create(validDto);

      expect(result).toEqual(sampleYear);
      expect(mockRepo.create).toHaveBeenCalledWith({
        name: validDto.name,
        startDate: new Date(validDto.startDate),
        endDate: new Date(validDto.endDate),
        isCurrent: false,
      });
    });

    it('rejects if startDate is after or equal to endDate', async () => {
      const invalidDto: CreateAcademicYearDto = {
        name: '2026-2027',
        startDate: '2027-06-30',
        endDate: '2026-09-01',
      };

      await expect(service.create(invalidDto)).rejects.toThrow(HttpException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('rejects duplicate academic year name within tenant', async () => {
      mockRepo.findByName!.mockResolvedValue(sampleYear);

      await expect(service.create(validDto)).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('rejects date range overlap with existing year', async () => {
      mockRepo.findByName!.mockResolvedValue(null);
      mockRepo.findOverlapping!.mockResolvedValue(sampleYear);

      await expect(service.create(validDto)).rejects.toThrow(HttpException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('atomically unsets previous and locks institute when isCurrent is true', async () => {
      mockRepo.findByName!.mockResolvedValue(null);
      mockRepo.findOverlapping!.mockResolvedValue(null);
      mockRepo.create!.mockResolvedValue({ ...sampleYear, isCurrent: true });

      const result = await service.create({ ...validDto, isCurrent: true });

      expect(mockTxHelper.executeInTransaction).toHaveBeenCalled();
      expect(mockRepo.lockInstituteForUpdate).toHaveBeenCalled();
      expect(mockRepo.unsetCurrentYear).toHaveBeenCalled();
      expect(result.isCurrent).toBe(true);
    });
  });

  describe('update', () => {
    it('updates an academic year successfully', async () => {
      mockRepo.findById!.mockResolvedValue(sampleYear);
      mockRepo.findByName!.mockResolvedValue(null);
      mockRepo.findOverlapping!.mockResolvedValue(null);
      mockRepo.update!.mockResolvedValue({ ...sampleYear, name: '2026-2027 Updated' });

      const result = await service.update(1, { name: '2026-2027 Updated' });

      expect(result.name).toBe('2026-2027 Updated');
      expect(mockRepo.update).toHaveBeenCalledWith(1, { name: '2026-2027 Updated' });
    });

    it('throws NotFoundException if academic year not found or belongs to another tenant', async () => {
      mockRepo.findById!.mockResolvedValue(null);

      await expect(service.update(999, { name: 'New' })).rejects.toThrow(NotFoundException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('rejects invalid updated dates', async () => {
      mockRepo.findById!.mockResolvedValue(sampleYear);

      await expect(
        service.update(1, { startDate: '2028-01-01', endDate: '2027-01-01' }),
      ).rejects.toThrow(HttpException);
    });

    it('atomically sets isCurrent with institute lock if transitioning to true', async () => {
      mockRepo.findById!.mockResolvedValue(sampleYear);
      mockRepo.update!.mockResolvedValue({ ...sampleYear, isCurrent: true });

      await service.update(1, { isCurrent: true });

      expect(mockTxHelper.executeInTransaction).toHaveBeenCalled();
      expect(mockRepo.lockInstituteForUpdate).toHaveBeenCalled();
      expect(mockRepo.unsetCurrentYear).toHaveBeenCalled();
    });
  });

  describe('setCurrent', () => {
    it('atomically sets the selected academic year as current with serialization lock', async () => {
      mockRepo.findById!.mockResolvedValue(sampleYear);
      mockRepo.update!.mockResolvedValue({ ...sampleYear, isCurrent: true });

      const result = await service.setCurrent(1);

      expect(result.isCurrent).toBe(true);
      expect(mockTxHelper.executeInTransaction).toHaveBeenCalled();
      expect(mockRepo.lockInstituteForUpdate).toHaveBeenCalled();
      expect(mockRepo.unsetCurrentYear).toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith(1, { isCurrent: true });
    });

    it('throws NotFoundException if academic year belongs to another tenant', async () => {
      mockRepo.findById!.mockResolvedValue(null);

      await expect(service.setCurrent(99)).rejects.toThrow(NotFoundException);
      expect(mockTxHelper.executeInTransaction).not.toHaveBeenCalled();
    });
  });

  describe('findSections', () => {
    it('returns sections for a verified academic year', async () => {
      mockRepo.findById!.mockResolvedValue(sampleYear);
      mockRepo.findSections!.mockResolvedValue([{ id: 10, name: 'Section A' }]);

      const sections = await service.findSections(1);

      expect(sections).toHaveLength(1);
      expect(mockRepo.findSections).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException if academic year does not exist in tenant', async () => {
      mockRepo.findById!.mockResolvedValue(null);

      await expect(service.findSections(999)).rejects.toThrow(NotFoundException);
    });
  });
});
