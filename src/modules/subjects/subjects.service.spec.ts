import { jest } from '@jest/globals';
import { HttpException, NotFoundException } from '@nestjs/common';
import { Subject } from '@prisma/client';
import { SubjectsService } from './subjects.service';
import { SubjectRepository } from './subject.repository';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

describe('SubjectsService', () => {
  let service: SubjectsService;
  let mockSubjectRepo: jest.Mocked<Partial<SubjectRepository>>;

  const currentInstituteId = 10;

  const sampleSubject: Subject = {
    id: 1,
    instituteId: currentInstituteId,
    name: 'Mathematics',
    code: 'MATH101',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockSubjectRepo = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findById: jest.fn(),
      findRawById: jest.fn(),
      findByCode: jest.fn(),
      findByName: jest.fn(),
      findAllPaginated: jest.fn(),
      countSectionSubjects: jest.fn(),
    };

    service = new SubjectsService(mockSubjectRepo as SubjectRepository);
  });

  describe('create', () => {
    const dto: CreateSubjectDto = {
      name: 'Mathematics',
      code: 'MATH101',
    };

    it('creates a subject successfully', async () => {
      mockSubjectRepo.findByCode!.mockResolvedValue(null);
      mockSubjectRepo.create!.mockResolvedValue(sampleSubject);

      const result = await service.create(dto);

      expect(result).toEqual(sampleSubject);
      expect(mockSubjectRepo.findByCode).toHaveBeenCalledWith('MATH101');
      expect(mockSubjectRepo.create).toHaveBeenCalledWith({
        name: 'Mathematics',
        code: 'MATH101',
      });
    });

    it('throws error when subject code already exists in institute', async () => {
      mockSubjectRepo.findByCode!.mockResolvedValue(sampleSubject);

      await expect(service.create(dto)).rejects.toThrow(HttpException);
      expect(mockSubjectRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated subjects', async () => {
      const paginatedResult = {
        data: [sampleSubject],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      mockSubjectRepo.findAllPaginated!.mockResolvedValue(paginatedResult as any);

      const query = { page: 1, limit: 10, search: 'Math' };
      const result = await service.findAll(query);

      expect(result).toEqual(paginatedResult);
      expect(mockSubjectRepo.findAllPaginated).toHaveBeenCalledWith(query, 'Math');
    });
  });

  describe('findById', () => {
    it('returns subject if found in institute', async () => {
      mockSubjectRepo.findById!.mockResolvedValue(sampleSubject);

      const result = await service.findById(1);

      expect(result).toEqual(sampleSubject);
      expect(mockSubjectRepo.findById).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException if subject does not exist', async () => {
      mockSubjectRepo.findById!.mockResolvedValue(null);
      mockSubjectRepo.findRawById!.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });

    it('throws 400 (subject_mismatch) if subject exists in another institute', async () => {
      mockSubjectRepo.findById!.mockResolvedValue(null);
      mockSubjectRepo.findRawById!.mockResolvedValue({
        ...sampleSubject,
        instituteId: 99,
      });

      await expect(service.findById(1)).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    const updateDto: UpdateSubjectDto = {
      name: 'Advanced Mathematics',
      code: 'MATH201',
    };

    it('updates subject successfully', async () => {
      mockSubjectRepo.findById!.mockResolvedValue(sampleSubject);
      mockSubjectRepo.findByCode!.mockResolvedValue(null);
      const updated = { ...sampleSubject, name: 'Advanced Mathematics', code: 'MATH201' };
      mockSubjectRepo.update!.mockResolvedValue(updated);

      const result = await service.update(1, updateDto);

      expect(result).toEqual(updated);
      expect(mockSubjectRepo.update).toHaveBeenCalledWith(1, {
        name: 'Advanced Mathematics',
        code: 'MATH201',
      });
    });

    it('throws error when updating to a duplicate code', async () => {
      mockSubjectRepo.findById!.mockResolvedValue(sampleSubject);
      mockSubjectRepo.findByCode!.mockResolvedValue({
        ...sampleSubject,
        id: 2,
        code: 'MATH201',
      });

      await expect(service.update(1, updateDto)).rejects.toThrow(HttpException);
      expect(mockSubjectRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes subject successfully when not assigned to any section', async () => {
      mockSubjectRepo.findById!.mockResolvedValue(sampleSubject);
      mockSubjectRepo.countSectionSubjects!.mockResolvedValue(0);
      mockSubjectRepo.delete!.mockResolvedValue(sampleSubject);

      const result = await service.delete(1);

      expect(result).toBeUndefined();
      expect(mockSubjectRepo.delete).toHaveBeenCalledWith(1);
    });

    it('throws 400 when subject has section assignments', async () => {
      mockSubjectRepo.findById!.mockResolvedValue(sampleSubject);
      mockSubjectRepo.countSectionSubjects!.mockResolvedValue(3);

      await expect(service.delete(1)).rejects.toThrow(HttpException);
      expect(mockSubjectRepo.delete).not.toHaveBeenCalled();
    });

    it('throws 404 when subject does not exist', async () => {
      mockSubjectRepo.findById!.mockResolvedValue(null);
      mockSubjectRepo.findRawById!.mockResolvedValue(null);

      await expect(service.delete(999)).rejects.toThrow(NotFoundException);
    });
  });
});
