import { TimetableConflictService } from './timetable-conflict.service';
import { ConflictType } from '../domain/timetable-conflict.types';

describe('TimetableConflictService', () => {
  let service: TimetableConflictService;

  beforeEach(() => {
    service = new TimetableConflictService();
  });

  it('detects teacher double booking across different sections', () => {
    const conflicts = service.detectConflicts({
      entries: [
        {
          id: 1,
          sectionId: 10,
          sectionName: 'Section A',
          subjectId: 1,
          teacherId: 100,
          teacherName: 'Teacher 1',
          dayOfWeek: 0,
          startTime: '08:00',
          endTime: '08:45',
        },
      ],
      allInstituteEntries: [
        {
          id: 2,
          sectionId: 20,
          sectionName: 'Section B',
          subjectId: 2,
          teacherId: 100,
          teacherName: 'Teacher 1',
          dayOfWeek: 0,
          startTime: '08:00',
          endTime: '08:45',
        },
      ],
    });

    const teacherConflict = conflicts.find(
      (c) => c.type === ConflictType.TEACHER_DOUBLE_BOOKING,
    );
    expect(teacherConflict).toBeDefined();
    expect(teacherConflict?.severity).toBe('HARD');
  });

  it('detects section double booking', () => {
    const conflicts = service.detectConflicts({
      entries: [
        {
          id: 1,
          sectionId: 10,
          subjectId: 1,
          teacherId: 100,
          dayOfWeek: 0,
          startTime: '08:00',
          endTime: '08:45',
        },
        {
          id: 2,
          sectionId: 10,
          subjectId: 2,
          teacherId: 101,
          dayOfWeek: 0,
          startTime: '08:00',
          endTime: '08:45',
        },
      ],
    });

    const sectionConflict = conflicts.find(
      (c) => c.type === ConflictType.SECTION_DOUBLE_BOOKING,
    );
    expect(sectionConflict).toBeDefined();
  });

  it('detects room double booking', () => {
    const conflicts = service.detectConflicts({
      entries: [
        {
          id: 1,
          sectionId: 10,
          subjectId: 1,
          teacherId: 100,
          roomId: 5,
          dayOfWeek: 0,
          startTime: '08:00',
          endTime: '08:45',
        },
      ],
      allInstituteEntries: [
        {
          id: 2,
          sectionId: 20,
          subjectId: 2,
          teacherId: 101,
          roomId: 5,
          dayOfWeek: 0,
          startTime: '08:00',
          endTime: '08:45',
        },
      ],
    });

    const roomConflict = conflicts.find(
      (c) => c.type === ConflictType.ROOM_DOUBLE_BOOKING,
    );
    expect(roomConflict).toBeDefined();
  });

  it('detects teacher scheduled outside availability window', () => {
    const conflicts = service.detectConflicts({
      entries: [
        {
          id: 1,
          sectionId: 10,
          subjectId: 1,
          teacherId: 100,
          dayOfWeek: 0,
          startTime: '12:00',
          endTime: '12:45',
        },
      ],
      teacherAvailabilities: [
        {
          teacherId: 100,
          dayOfWeek: 0,
          startTime: '08:00',
          endTime: '11:00',
        },
      ],
    });

    const availConflict = conflicts.find(
      (c) => c.type === ConflictType.TEACHER_UNAVAILABLE,
    );
    expect(availConflict).toBeDefined();
  });

  it('detects break overlap', () => {
    const conflicts = service.detectConflicts({
      entries: [
        {
          id: 1,
          sectionId: 10,
          subjectId: 1,
          teacherId: 100,
          dayOfWeek: 0,
          startTime: '10:00',
          endTime: '10:45',
        },
      ],
      scheduleConfig: {
        workingDays: [0, 1, 2, 3, 4],
        dayStartTime: '08:00',
        dayEndTime: '14:00',
        breaks: [{ name: 'Break', startTime: '10:15', endTime: '10:45' }],
      },
    });

    const breakConflict = conflicts.find(
      (c) => c.type === ConflictType.SCHEDULE_CONFIG_VIOLATION,
    );
    expect(breakConflict).toBeDefined();
  });
});
