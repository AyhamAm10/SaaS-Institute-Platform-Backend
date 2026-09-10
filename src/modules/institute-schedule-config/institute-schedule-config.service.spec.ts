import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { InstituteScheduleConfigService } from './institute-schedule-config.service';
import { InstituteScheduleConfigRepository } from './institute-schedule-config.repository';

describe('InstituteScheduleConfigService', () => {
  let service: InstituteScheduleConfigService;
  let mockRepository: Partial<Record<keyof InstituteScheduleConfigRepository, jest.Mock>>;

  beforeEach(async () => {
    mockRepository = {
      findConfig: jest.fn(),
      upsertConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstituteScheduleConfigService,
        {
          provide: InstituteScheduleConfigRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<InstituteScheduleConfigService>(InstituteScheduleConfigService);
  });

  describe('calculateTimeSlots', () => {
    it('should correctly calculate periods around breaks', () => {
      const slots = service.calculateTimeSlots(
        '08:00',
        '11:00',
        60,
        [{ name: 'Break', startTime: '09:00', endTime: '09:30' }],
      );

      expect(slots).toHaveLength(3);
      expect(slots[0]).toEqual({
        type: 'LESSON',
        periodNumber: 1,
        startTime: '08:00',
        endTime: '09:00',
        durationMinutes: 60,
      });
      expect(slots[1]).toEqual({
        type: 'BREAK',
        name: 'Break',
        startTime: '09:00',
        endTime: '09:30',
        durationMinutes: 30,
      });
      expect(slots[2]).toEqual({
        type: 'LESSON',
        periodNumber: 2,
        startTime: '09:30',
        endTime: '10:30',
        durationMinutes: 60,
      });
    });
  });

  describe('updateConfig', () => {
    it('should throw when dayStartTime >= dayEndTime', async () => {
      await expect(
        service.updateConfig({
          workingDays: [0, 1],
          dayStartTime: '14:00',
          dayEndTime: '08:00',
          periodDurationMinutes: 45,
        }),
      ).rejects.toThrow();
    });

    it('should throw when break falls outside working hours', async () => {
      await expect(
        service.updateConfig({
          workingDays: [0, 1],
          dayStartTime: '08:00',
          dayEndTime: '14:00',
          periodDurationMinutes: 45,
          breaks: [{ name: 'Late Break', startTime: '14:30', endTime: '15:00' }],
        }),
      ).rejects.toThrow();
    });

    it('should throw when breaks overlap', async () => {
      await expect(
        service.updateConfig({
          workingDays: [0, 1],
          dayStartTime: '08:00',
          dayEndTime: '14:00',
          periodDurationMinutes: 45,
          breaks: [
            { name: 'Break 1', startTime: '10:00', endTime: '10:30' },
            { name: 'Break 2', startTime: '10:15', endTime: '10:45' },
          ],
        }),
      ).rejects.toThrow();
    });

    it('should update config and return calculated slots', async () => {
      mockRepository.upsertConfig!.mockResolvedValue({
        id: 1,
        instituteId: 10,
        workingDays: [0, 1, 2, 3, 4],
        dayStartTime: '08:00',
        dayEndTime: '13:00',
        periodDurationMinutes: 60,
        breaks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.updateConfig({
        workingDays: [0, 1, 2, 3, 4],
        dayStartTime: '08:00',
        dayEndTime: '13:00',
        periodDurationMinutes: 60,
        breaks: [],
      });

      expect(res.slots.filter((s) => s.type === 'LESSON')).toHaveLength(5);
    });
  });
});
