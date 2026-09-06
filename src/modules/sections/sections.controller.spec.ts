import { jest } from '@jest/globals';
import { SectionsController } from './sections.controller';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { SectionQueryDto } from './dto/section-query.dto';
import { Prisma } from '@prisma/client';

describe('SectionsController', () => {
  let controller: SectionsController;
  let service: jest.Mocked<SectionsService>;

  const mockSection = {
    id: 1,
    instituteId: 10,
    branchId: 5,
    academicYearId: 2,
    name: 'Section 1A',
    grade: 'Grade 1',
    feeAmount: new Prisma.Decimal(1500),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue(mockSection),
      findAll: jest.fn().mockResolvedValue({
        data: [mockSection],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
      findById: jest.fn().mockResolvedValue(mockSection),
      getDetails: jest.fn().mockResolvedValue({
        ...mockSection,
        branch: { id: 5, name: 'Main' },
        academicYear: { id: 2, name: '2026-2027' },
        _count: { studentEnrollments: 10 },
      }),
      update: jest.fn().mockResolvedValue({ ...mockSection, name: 'Section 1B' }),
      updateFee: jest.fn().mockResolvedValue({ ...mockSection, feeAmount: new Prisma.Decimal(2000) }),
      validateSectionBelongsToAcademicYear: jest.fn().mockResolvedValue({ valid: true, section: mockSection }),
    } as any;

    controller = new SectionsController(service);
  });

  it('delegates create to service', async () => {
    const dto: CreateSectionDto = {
      name: 'Section 1A',
      grade: 'Grade 1',
      branchId: 5,
      academicYearId: 2,
      feeAmount: 1500,
    };

    const result = await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockSection);
  });

  it('delegates findAll to service with query', async () => {
    const query = new SectionQueryDto();
    const result = await controller.findAll(query);
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result.data).toHaveLength(1);
  });

  it('delegates findById to service', async () => {
    const result = await controller.findById(1);
    expect(service.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockSection);
  });

  it('delegates getDetails to service', async () => {
    const result = await controller.getDetails(1);
    expect(service.getDetails).toHaveBeenCalledWith(1);
    expect(result).toHaveProperty('_count');
  });

  it('delegates update to service', async () => {
    const dto: UpdateSectionDto = { name: 'Section 1B' };
    const result = await controller.update(1, dto);
    expect(service.update).toHaveBeenCalledWith(1, dto);
    expect(result.name).toBe('Section 1B');
  });

  it('delegates updateFee to service', async () => {
    const result = await controller.updateFee(1, { feeAmount: 2000 });
    expect(service.updateFee).toHaveBeenCalledWith(1, { feeAmount: 2000 });
    expect(result.feeAmount).toEqual(new Prisma.Decimal(2000));
  });

  it('delegates validateAcademicYear to service', async () => {
    const result = await controller.validateAcademicYear(1, 2);
    expect(service.validateSectionBelongsToAcademicYear).toHaveBeenCalledWith(1, 2);
    expect(result.valid).toBe(true);
  });
});
