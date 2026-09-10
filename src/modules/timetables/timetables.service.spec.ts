import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { TimetablesService } from './timetables.service';
import { TimetableRepository } from './timetable.repository';
import { TimetableEntryRepository } from './timetable-entry.repository';
import { TimetableConflictService } from './services/timetable-conflict.service';
import { TimetableSchedulerService } from './services/timetable-scheduler.service';
import { InstituteScheduleConfigService } from '../institute-schedule-config/institute-schedule-config.service';
import { SectionRepository } from '../sections/section.repository';
import { SectionSubjectRepository } from '../sections/section-subject.repository';
import { TeacherRepository } from '../teachers/teacher.repository';
import { TeacherAssignmentRepository } from '../teachers/teacher-assignment.repository';
import { TeacherAvailabilityRepository } from '../teachers/teacher-availability.repository';
import { RoomRepository } from '../rooms/room.repository';
import { RoomAvailabilityRepository } from '../rooms/room-availability.repository';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
import { TransactionHelper } from '../../database/transaction.helper';

describe('TimetablesService', () => {
  let service: TimetablesService;

  const mockTimetableRepo = {
    findBySectionAndYear: jest.fn(),
    upsertTimetable: jest.fn(),
    findWithEntries: jest.fn(),
  };

  const mockEntryRepo = {
    findInstituteEntriesForYear: jest.fn(),
    findById: jest.fn(),
    createEntry: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
    deleteUnlockedEntries: jest.fn(),
  };

  const mockConflictService = {
    detectConflicts: jest.fn().mockReturnValue([]),
  };

  const mockSchedulerService = {
    generateSchedule: jest.fn(),
  };

  const mockConfigService = {
    getConfig: jest.fn().mockResolvedValue({
      id: 1,
      instituteId: 1,
      workingDays: [0, 1, 2, 3, 4],
      dayStartTime: '08:00',
      dayEndTime: '14:00',
      periodDurationMinutes: 45,
      breaks: [],
      calculatedSlots: [
        { periodNumber: 1, startTime: '08:00', endTime: '08:45' },
      ],
    }),
  };

  const mockSectionRepo = {
    findById: jest.fn(),
  };

  const mockSectionSubjectRepo = {
    findSubjectsBySection: jest.fn().mockResolvedValue([]),
    findBySectionAndSubject: jest.fn(),
  };

  const mockTeacherRepo = {
    findById: jest.fn(),
  };

  const mockTeacherAssignmentRepo = {
    findByTeacher: jest.fn().mockResolvedValue([]),
  };

  const mockTeacherAvailabilityRepo = {
    findByTeacher: jest.fn().mockResolvedValue([]),
  };

  const mockRoomRepo = {
    findById: jest.fn(),
  };

  const mockRoomAvailabilityRepo = {
    findMany: jest.fn().mockResolvedValue([]),
  };

  const mockAcademicYearRepo = {
    findById: jest.fn(),
  };

  const mockTransactionHelper = {
    run: jest.fn().mockImplementation((cb) => cb({})),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimetablesService,
        { provide: TimetableRepository, useValue: mockTimetableRepo },
        { provide: TimetableEntryRepository, useValue: mockEntryRepo },
        { provide: TimetableConflictService, useValue: mockConflictService },
        { provide: TimetableSchedulerService, useValue: mockSchedulerService },
        { provide: InstituteScheduleConfigService, useValue: mockConfigService },
        { provide: SectionRepository, useValue: mockSectionRepo },
        {
          provide: SectionSubjectRepository,
          useValue: mockSectionSubjectRepo,
        },
        { provide: TeacherRepository, useValue: mockTeacherRepo },
        {
          provide: TeacherAssignmentRepository,
          useValue: mockTeacherAssignmentRepo,
        },
        {
          provide: TeacherAvailabilityRepository,
          useValue: mockTeacherAvailabilityRepo,
        },
        { provide: RoomRepository, useValue: mockRoomRepo },
        {
          provide: RoomAvailabilityRepository,
          useValue: mockRoomAvailabilityRepo,
        },
        { provide: AcademicYearRepository, useValue: mockAcademicYearRepo },
        { provide: TransactionHelper, useValue: mockTransactionHelper },
      ],
    }).compile();

    service = module.get<TimetablesService>(TimetablesService);
  });

  it('retrieves or creates a timetable for section and academic year', async () => {
    mockSectionRepo.findById.mockResolvedValue({
      id: 1,
      name: 'Class A',
      academicBranchId: 10,
    });
    mockAcademicYearRepo.findById.mockResolvedValue({ id: 100, name: '2026-2027' });
    mockTimetableRepo.findBySectionAndYear.mockResolvedValue(null);
    mockTimetableRepo.upsertTimetable.mockResolvedValue({ id: 50, name: 'جدول Class A' });
    mockTimetableRepo.findWithEntries.mockResolvedValue({
      id: 50,
      name: 'جدول Class A',
      entries: [],
    });
    mockEntryRepo.findInstituteEntriesForYear.mockResolvedValue([]);

    const result = await service.getTimetable(100, 1);

    expect(result.id).toBe(50);
    expect(result.conflicts).toEqual([]);
    expect(mockTimetableRepo.upsertTimetable).toHaveBeenCalledWith(
      100,
      1,
      'جدول Class A',
    );
  });
});
