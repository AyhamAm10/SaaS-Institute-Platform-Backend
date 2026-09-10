import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { RoomsService } from './rooms.service';
import { RoomRepository } from './room.repository';
import { RoomAvailabilityRepository } from './room-availability.repository';
import { TransactionHelper } from '../../database/transaction.helper';

describe('RoomsService', () => {
  let service: RoomsService;
  let mockRoomRepo: any;
  let mockAvailabilityRepo: any;
  let mockTransactionHelper: any;

  beforeEach(async () => {
    mockRoomRepo = {
      getInstituteId: jest.fn().mockReturnValue(1),
      findByName: jest.fn(),
      findById: jest.fn(),
      findByIdWithDetails: jest.fn(),
      findAllFiltered: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      countTimetableEntries: jest.fn(),
      client: {
        roomAvailability: { createMany: jest.fn() },
      },
    };

    mockAvailabilityRepo = {
      findByRoom: jest.fn(),
      replaceAvailabilities: jest.fn(),
    };

    mockTransactionHelper = {
      executeInTransaction: jest.fn().mockImplementation((fn) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: RoomRepository, useValue: mockRoomRepo },
        { provide: RoomAvailabilityRepository, useValue: mockAvailabilityRepo },
        { provide: TransactionHelper, useValue: mockTransactionHelper },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  describe('create', () => {
    it('should throw 409 if room name already exists', async () => {
      mockRoomRepo.findByName.mockResolvedValue({ id: 5, name: 'Room 101' });

      await expect(
        service.create({ name: 'Room 101' }),
      ).rejects.toThrow();
    });

    it('should throw 400 if availability window has invalid time range', async () => {
      mockRoomRepo.findByName.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Room 101',
          availabilities: [{ dayOfWeek: 1, startTime: '15:00', endTime: '10:00' }],
        }),
      ).rejects.toThrow();
    });

    it('should create room and availabilities successfully', async () => {
      mockRoomRepo.findByName.mockResolvedValue(null);
      mockRoomRepo.create.mockResolvedValue({ id: 10, name: 'Room 101' });
      mockRoomRepo.findByIdWithDetails.mockResolvedValue({ id: 10, name: 'Room 101' });

      const result = await service.create({
        name: 'Room 101',
        capacity: 25,
        availabilities: [{ dayOfWeek: 0, startTime: '08:00', endTime: '14:00' }],
      });

      expect(result).toBeDefined();
      expect(mockRoomRepo.create).toHaveBeenCalled();
      expect(mockRoomRepo.client.roomAvailability.createMany).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should throw 400 if room has timetable entries', async () => {
      mockRoomRepo.findById.mockResolvedValue({ id: 10 });
      mockRoomRepo.countTimetableEntries.mockResolvedValue(3);

      await expect(service.delete(10)).rejects.toThrow();
    });

    it('should delete room when no timetable entries linked', async () => {
      mockRoomRepo.findById.mockResolvedValue({ id: 10 });
      mockRoomRepo.countTimetableEntries.mockResolvedValue(0);

      await service.delete(10);
      expect(mockRoomRepo.delete).toHaveBeenCalledWith(10);
    });
  });
});
