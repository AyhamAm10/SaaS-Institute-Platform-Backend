import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { DailyAttendanceRepository } from './daily-attendance.repository';
import { StudentRepository } from '../students/student.repository';
import { SectionRepository } from '../sections/section.repository';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { InstituteScheduleConfigService } from '../institute-schedule-config/institute-schedule-config.service';
import { checkInStatus, closeMinutes, countDay } from './attendance.rules';
import { getLocalParts } from '../../common/time/timezone';
import { RequestContext } from '../../context/request-context';
import { TeacherScopeService } from '../sections/teacher-scope.service';

const config = {
  workingDays: [6, 0, 1, 2, 3, 4], // Saturday → Thursday
  dayStartTime: '08:00',
  dayEndTime: '14:00',
  lateAfterMinutes: 15,
  attendanceCloseTime: null,
};
// 2026-11-04 is a Wednesday; Damascus = UTC+3
const at = (localTime: string, date = '2026-11-04') =>
  new Date(`${date}T${localTime}:00+03:00`).toISOString();

describe('attendance rules', () => {
  it('marks LATE only after dayStartTime + lateAfterMinutes', () => {
    expect(checkInStatus(config, 8 * 60 + 15)).toBe('PRESENT');
    expect(checkInStatus(config, 8 * 60 + 16)).toBe('LATE');
  });

  it('closes at attendanceCloseTime, or the end of the day', () => {
    expect(closeMinutes(config)).toBe(14 * 60);
    expect(closeMinutes({ ...config, attendanceCloseTime: '10:30' })).toBe(630);
  });

  it('counts the day, students without a record as not recorded', () => {
    expect(countDay(['PRESENT', 'LATE', 'LATE', 'ABSENT', null])).toEqual({
      present: 1,
      late: 2,
      absent: 1,
      excused: 0,
      notRecorded: 1,
    });
  });

  it('uses the institute date around midnight', () => {
    // 22:30 UTC on Nov 4 is already Nov 5 in Damascus
    expect(
      getLocalParts(new Date('2026-11-04T22:30:00Z'), 'Asia/Damascus').date,
    ).toBe('2026-11-05');
  });
});

describe('AttendanceService', () => {
  let service: AttendanceService;
  let repo: any;
  let clock: any;
  let scope: any;

  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date('2026-11-04T16:00:00+03:00') });
    // Not a teacher by default: no scope restriction
    scope = {
      taughtPairs: jest.fn<any>().mockResolvedValue(null),
      taughtSectionIds: jest.fn<any>().mockResolvedValue(null),
      assertTeachesSubject: jest.fn<any>().mockResolvedValue(undefined),
      assertTeachesSection: jest.fn<any>().mockResolvedValue(undefined),
    };
    repo = {
      isActivelyEnrolled: jest.fn<any>().mockResolvedValue(true),
      findForDay: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockImplementation((d: any) => ({ id: 1, ...d })),
      update: jest
        .fn<any>()
        .mockImplementation((id: number, d: any) => ({ id, ...d })),
      markAbsences: jest.fn<any>().mockResolvedValue(3),
    };
    clock = {
      getTimezone: jest.fn<any>().mockResolvedValue('Asia/Damascus'),
      today: jest.fn<any>().mockResolvedValue('2026-11-04'),
      localParts: jest.fn<any>(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: DailyAttendanceRepository, useValue: repo },
        {
          provide: StudentRepository,
          useValue: {
            findById: jest.fn<any>().mockResolvedValue({ id: 7, branchId: 2 }),
          },
        },
        { provide: SectionRepository, useValue: { findById: jest.fn() } },
        { provide: InstituteClockService, useValue: clock },
        {
          provide: InstituteScheduleConfigService,
          useValue: { getConfig: jest.fn<any>().mockResolvedValue(config) },
        },
        { provide: TeacherScopeService, useValue: scope },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
  });

  afterEach(() => jest.useRealTimers());

  it('checks in LATE on the local date of the institute', async () => {
    await service.checkIn({ studentId: 7, at: at('08:40') });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 7,
        branchId: 2,
        status: 'LATE',
        checkInMethod: 'MANUAL',
        date: new Date('2026-11-04T00:00:00.000Z'),
      }),
    );
  });

  it('refuses a second check-in the same day', async () => {
    repo.findForDay.mockResolvedValue({ id: 1, checkInAt: new Date() });
    await expect(
      service.checkIn({ studentId: 7, at: at('09:00') }),
    ).rejects.toThrow(BadRequestException);
  });

  it('turns an ABSENT mark into a late check-in', async () => {
    repo.findForDay.mockResolvedValue({
      id: 5,
      checkInAt: null,
      status: 'ABSENT',
    });
    await service.checkIn({ studentId: 7, at: at('11:00') });
    expect(repo.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ status: 'LATE' }),
    );
  });

  it('refuses a holiday and a student without an active enrollment', async () => {
    // 2026-11-06 is a Friday
    await expect(
      service.checkIn({ studentId: 7, at: at('08:00', '2026-11-06') }),
    ).rejects.toThrow(BadRequestException);
    repo.isActivelyEnrolled.mockResolvedValue(false);
    await expect(
      service.checkIn({ studentId: 7, at: at('08:00') }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a check-out before the check-in', async () => {
    await expect(
      service.checkOut({ studentId: 7, at: at('13:00') }),
    ).rejects.toThrow(BadRequestException);
    repo.findForDay.mockResolvedValue({
      id: 1,
      checkInAt: new Date(at('13:30')),
      checkOutAt: null,
    });
    await expect(
      service.checkOut({ studentId: 7, at: at('13:00') }),
    ).rejects.toThrow(BadRequestException);
    await service.checkOut({ studentId: 7, at: at('13:45') });
    expect(repo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ checkOutMethod: 'MANUAL' }),
    );
  });

  it('refuses times in the future', async () => {
    await expect(
      service.checkIn({ studentId: 7, at: at('18:00') }),
    ).rejects.toThrow(BadRequestException);
  });

  it('marks absences only after the close time of a working day', async () => {
    clock.localParts.mockResolvedValue({
      date: '2026-11-04',
      minutesOfDay: 13 * 60,
      dayOfWeek: 3,
    });
    expect(await service.markAbsencesIfClosed()).toBe(0);
    clock.localParts.mockResolvedValue({
      date: '2026-11-06',
      minutesOfDay: 15 * 60,
      dayOfWeek: 5,
    });
    expect(await service.markAbsencesIfClosed()).toBe(0);
    clock.localParts.mockResolvedValue({
      date: '2026-11-04',
      minutesOfDay: 14 * 60,
      dayOfWeek: 3,
    });
    expect(await service.markAbsencesIfClosed()).toBe(3);
    expect(repo.markAbsences).toHaveBeenCalledWith('2026-11-04');
  });

  it('corrects times and recomputes the status (audited update)', async () => {
    repo.findById = jest.fn<any>().mockResolvedValue({
      id: 1,
      checkInAt: new Date(at('08:05')),
      checkOutAt: null,
    });
    await service.update(1, { checkInAt: at('08:30') });
    expect(repo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'LATE' }),
    );
    await expect(
      service.update(1, { checkOutAt: at('08:00') }),
    ).rejects.toThrow(BadRequestException);
  });

  describe('teacher scope', () => {
    beforeEach(() => {
      scope.taughtSectionIds.mockResolvedValue([10]);
      repo.findActiveSectionIds = jest.fn<any>().mockResolvedValue([11]);
    });

    it('refuses a student outside the teacher sections', async () => {
      await expect(
        service.checkIn({ studentId: 7, at: at('08:00') }),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('accepts a student of a section the teacher teaches in', async () => {
      repo.findActiveSectionIds.mockResolvedValue([10]);
      await service.checkIn({ studentId: 7, at: at('08:00') });
      expect(repo.create).toHaveBeenCalled();
    });
  });
});

describe('DailyAttendanceRepository.markAbsences', () => {
  it('only inserts missing days (skipDuplicates): existing records are never touched', async () => {
    jest.spyOn(RequestContext, 'getInstituteId').mockReturnValue(1);
    const prisma: any = {
      student: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: 7, branchId: 2 }]),
      },
      dailyAttendance: {
        createMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
    };
    const repository = new DailyAttendanceRepository(prisma);
    expect(await repository.markAbsences('2026-11-04')).toBe(1);
    const args = prisma.dailyAttendance.createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data[0]).toEqual(
      expect.objectContaining({ studentId: 7, branchId: 2, status: 'ABSENT' }),
    );
    expect(prisma.dailyAttendance.update).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
