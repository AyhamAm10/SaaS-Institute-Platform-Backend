import { jest } from '@jest/globals';
import { TimetableSchedulerService } from './timetable-scheduler.service';
import { TimetableConflictService } from './timetable-conflict.service';
import { ScheduleConfigResponseDto } from '../../institute-schedule-config/dto/schedule-config-response.dto';

describe('TimetableSchedulerService', () => {
  let scheduler: TimetableSchedulerService;
  let conflictService: TimetableConflictService;

  const sampleConfig: ScheduleConfigResponseDto = {
    id: 1,
    instituteId: 1,
    workingDays: [0, 1, 2, 3, 4],
    dayStartTime: '08:00',
    dayEndTime: '12:00',
    periodDurationMinutes: 45,
    breaks: [{ name: 'Break', startTime: '09:30', endTime: '10:00' }],
    slots: [
      { type: 'LESSON', periodNumber: 1, startTime: '08:00', endTime: '08:45', durationMinutes: 45 },
      { type: 'LESSON', periodNumber: 2, startTime: '08:45', endTime: '09:30', durationMinutes: 45 },
      { type: 'BREAK', name: 'Break', startTime: '09:30', endTime: '10:00', durationMinutes: 30 },
      { type: 'LESSON', periodNumber: 3, startTime: '10:00', endTime: '10:45', durationMinutes: 45 },
      { type: 'LESSON', periodNumber: 4, startTime: '10:45', endTime: '11:30', durationMinutes: 45 },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    conflictService = new TimetableConflictService();
    scheduler = new TimetableSchedulerService(conflictService);
  });

  it('generates a schedule satisfying section subject weekly periods', async () => {
    const result = await scheduler.solve({
      sections: [{ id: 1, name: 'Section 1A', academicBranchId: 1 }],
      sectionSubjects: [
        {
          id: 10,
          sectionId: 1,
          subjectId: 101,
          subjectName: 'Math',
          teacherId: 201,
          weeklyPeriods: 2,
        },
        {
          id: 11,
          sectionId: 1,
          subjectId: 102,
          subjectName: 'Science',
          teacherId: 202,
          weeklyPeriods: 2,
        },
      ],
      teachers: [
        { id: 201, name: 'Math Teacher' },
        { id: 202, name: 'Science Teacher' },
      ],
      teacherAssignments: [
        { teacherId: 201, academicBranchId: 1, subjectId: 101 },
        { teacherId: 202, academicBranchId: 1, subjectId: 102 },
      ],
      teacherAvailabilities: [],
      rooms: [{ id: 301, name: 'Room 101', capacity: 30 }],
      roomAvailabilities: [],
      scheduleConfig: sampleConfig,
    });

    expect(result.success).toBe(true);
    expect(result.entries.length).toBe(4);
    expect(result.unassignedRequirements.length).toBe(0);

    const mathEntries = result.entries.filter((e) => e.subjectId === 101);
    const scienceEntries = result.entries.filter((e) => e.subjectId === 102);
    expect(mathEntries.length).toBe(2);
    expect(scienceEntries.length).toBe(2);
  });

  it('respects teacher availability windows', async () => {
    const result = await scheduler.solve({
      sections: [{ id: 1, name: 'Section 1A', academicBranchId: 1 }],
      sectionSubjects: [
        {
          id: 10,
          sectionId: 1,
          subjectId: 101,
          teacherId: 201,
          weeklyPeriods: 2,
        },
      ],
      teachers: [{ id: 201, name: 'Part Time Teacher' }],
      teacherAssignments: [
        { teacherId: 201, academicBranchId: 1, subjectId: 101 },
      ],
      // Teacher only available on day 0 (Sunday) between 08:00 and 09:30 (periods 1 and 2)
      teacherAvailabilities: [
        {
          teacherId: 201,
          dayOfWeek: 0,
          startTime: '08:00',
          endTime: '09:30',
        },
      ],
      rooms: [],
      roomAvailabilities: [],
      scheduleConfig: sampleConfig,
    });

    expect(result.success).toBe(true);
    expect(result.entries.length).toBe(2);
    result.entries.forEach((e) => {
      expect(e.dayOfWeek).toBe(0);
      expect(['08:00', '08:45']).toContain(e.startTime);
    });
  });

  it('preserves locked entries during scheduling', async () => {
    const lockedEntry = {
      id: 999,
      sectionId: 1,
      subjectId: 101,
      teacherId: 201,
      roomId: 301,
      dayOfWeek: 0,
      periodNumber: 1,
      startTime: '08:00',
      endTime: '08:45',
      isLocked: true,
    };

    const result = await scheduler.solve({
      sections: [{ id: 1, name: 'Section 1A', academicBranchId: 1 }],
      sectionSubjects: [
        {
          id: 10,
          sectionId: 1,
          subjectId: 101,
          teacherId: 201,
          weeklyPeriods: 2,
        },
      ],
      teachers: [{ id: 201, name: 'Teacher 1' }],
      teacherAssignments: [
        { teacherId: 201, academicBranchId: 1, subjectId: 101 },
      ],
      teacherAvailabilities: [],
      rooms: [{ id: 301, name: 'Room 1', capacity: 30 }],
      roomAvailabilities: [],
      scheduleConfig: sampleConfig,
      existingEntries: [lockedEntry],
      options: { incremental: true },
    });

    expect(result.success).toBe(true);
    expect(result.entries.length).toBe(2);
    const lockedFound = result.entries.find((e) => e.isLocked);
    expect(lockedFound).toBeDefined();
    expect(lockedFound?.dayOfWeek).toBe(0);
    expect(lockedFound?.startTime).toBe('08:00');
  });
});
