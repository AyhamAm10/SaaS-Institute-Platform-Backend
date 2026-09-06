import { jest } from '@jest/globals';
import { AcademicYearsController } from './academic-years.controller';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

describe('AcademicYearsController', () => {
  let controller: AcademicYearsController;
  let service: jest.Mocked<AcademicYearsService>;

  const mockYear = {
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
    service = {
      create: jest.fn<any>().mockResolvedValue(mockYear),
      update: jest.fn<any>().mockResolvedValue({ ...mockYear, name: '2026-2027 (Updated)' }),
      setCurrent: jest.fn<any>().mockResolvedValue({ ...mockYear, isCurrent: true }),
      findAll: jest.fn<any>().mockResolvedValue({
        data: [mockYear],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
      findById: jest.fn<any>().mockResolvedValue(mockYear),
      findSections: jest.fn<any>().mockResolvedValue([{ id: 1, name: 'Section A' }]),
    } as any;

    controller = new AcademicYearsController(service);
  });

  it('delegates create to service', async () => {
    const dto: CreateAcademicYearDto = {
      name: '2026-2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
    };
    const result = await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockYear);
  });

  it('delegates update to service', async () => {
    const dto: UpdateAcademicYearDto = { name: '2026-2027 (Updated)' };
    const result = await controller.update(1, dto);
    expect(service.update).toHaveBeenCalledWith(1, dto);
    expect(result.name).toBe('2026-2027 (Updated)');
  });

  it('delegates setCurrent to service', async () => {
    const result = await controller.setCurrent(1);
    expect(service.setCurrent).toHaveBeenCalledWith(1);
    expect(result.isCurrent).toBe(true);
  });

  it('delegates findAll to service', async () => {
    const query = new PaginationQueryDto();
    const result = await controller.findAll(query);
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result.data).toHaveLength(1);
  });

  it('delegates findById to service', async () => {
    const result = await controller.findById(1);
    expect(service.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockYear);
  });

  it('delegates findSections to service', async () => {
    const result = await controller.findSections(1);
    expect(service.findSections).toHaveBeenCalledWith(1);
    expect(result).toHaveLength(1);
  });
});
