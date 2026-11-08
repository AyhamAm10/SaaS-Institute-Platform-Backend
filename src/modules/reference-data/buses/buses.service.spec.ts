import { jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { BusesService } from './buses.service';
import { BusRepository } from './bus.repository';
import { BranchRepository } from '../../branches/branch.repository';

describe('BusesService', () => {
  let service: BusesService;
  let busRepository: any;

  beforeEach(() => {
    busRepository = {
      findById: jest.fn(),
      findByName: jest.fn(),
      findByNameInBranch: jest.fn(),
      findPaginated: jest.fn(),
      countUsage: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const branchRepository = {
      findById: jest.fn(),
      getOrCreateDefaultBranch: jest.fn(),
    };
    service = new BusesService(
      busRepository as unknown as BusRepository,
      branchRepository as unknown as BranchRepository,
    );
  });

  describe('assertHasCapacity', () => {
    it('allows assignment if capacity is not set', async () => {
      busRepository.findById.mockResolvedValue({ id: 1, capacity: null });
      await expect(service.assertHasCapacity(1)).resolves.not.toThrow();
      expect(busRepository.countUsage).not.toHaveBeenCalled();
    });

    it('allows assignment if used < capacity', async () => {
      busRepository.findById.mockResolvedValue({ id: 1, capacity: 15 });
      busRepository.countUsage.mockResolvedValue(10);
      await expect(service.assertHasCapacity(1)).resolves.not.toThrow();
      expect(busRepository.countUsage).toHaveBeenCalledWith(1, undefined);
    });

    it('rejects assignment if used >= capacity', async () => {
      busRepository.findById.mockResolvedValue({ id: 1, capacity: 15 });
      busRepository.countUsage.mockResolvedValue(15);
      await expect(service.assertHasCapacity(1)).rejects.toThrow(HttpException);
    });

    it('passes currentStudentId to exclude the student when updating', async () => {
      busRepository.findById.mockResolvedValue({ id: 1, capacity: 15 });
      busRepository.countUsage.mockResolvedValue(14);
      await expect(service.assertHasCapacity(1, 99)).resolves.not.toThrow();
      expect(busRepository.countUsage).toHaveBeenCalledWith(1, 99);
    });
  });
});

