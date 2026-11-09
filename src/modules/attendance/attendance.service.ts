import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  AttendanceMethod,
  AttendanceStatus,
  DailyAttendance,
} from '@prisma/client';
import { DailyAttendanceRepository } from './daily-attendance.repository';
import { StudentRepository } from '../students/student.repository';
import { SectionRepository } from '../sections/section.repository';
import { TeacherScopeService } from '../sections/teacher-scope.service';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { InstituteScheduleConfigService } from '../institute-schedule-config/institute-schedule-config.service';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import {
  dateOnly,
  getLocalParts,
  shiftLocalDate,
} from '../../common/time/timezone';
import {
  attendanceRate,
  attendanceSeries,
  AttendanceDayConfig,
  checkInStatus,
  closeMinutes,
  countDay,
  dayOfWeekOf,
  isWorkingDay,
  lastWorkingDays,
} from './attendance.rules';
import {
  AttendanceMarkDto,
  BulkAttendanceDto,
  DailyQueryDto,
  ExcuseDto,
  StudentAttendanceQueryDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto';

const fail = (key: string): never => {
  throw new BadRequestException(ErrorMessages.get(key));
};

/** A few minutes of tolerance for client clocks. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Daily attendance (role.md §10.4): one record per student per local day,
 * check-in on working days for actively enrolled students only (LATE after
 * dayStartTime + lateAfterMinutes), check-out after check-in, and a job that
 * marks the missing students ABSENT after the close time.
 */
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(DailyAttendanceRepository)
    private readonly repository: DailyAttendanceRepository,
    @Inject(StudentRepository)
    private readonly studentRepository: StudentRepository,
    @Inject(SectionRepository)
    private readonly sectionRepository: SectionRepository,
    @Inject(InstituteClockService)
    private readonly clock: InstituteClockService,
    @Inject(InstituteScheduleConfigService)
    private readonly scheduleConfig: InstituteScheduleConfigService,
    @Inject(TeacherScopeService)
    private readonly teacherScope: TeacherScopeService,
  ) {}

  async checkIn(
    dto: AttendanceMarkDto,
    method: AttendanceMethod = AttendanceMethod.MANUAL,
  ) {
    await this.assertCanMark(dto.studentId);
    return this.markIn(dto, method);
  }

  async checkOut(
    dto: AttendanceMarkDto,
    method: AttendanceMethod = AttendanceMethod.MANUAL,
  ) {
    await this.assertCanMark(dto.studentId);
    return this.markOut(dto, method);
  }

  private async markIn(dto: AttendanceMarkDto, method: AttendanceMethod) {
    const at = this.instant(dto.at);
    const student = await this.studentRepository.findById(dto.studentId);
    Ensure.exists(student, 'Student');
    if (!(await this.repository.isActivelyEnrolled(student.id)))
      fail('attendance_not_enrolled');

    const config = await this.dayConfig();
    const local = getLocalParts(at, await this.clock.getTimezone());
    if (!isWorkingDay(config, local.dayOfWeek))
      fail('attendance_not_working_day');

    const existing = await this.repository.findForDay(student.id, local.date);
    if (existing?.checkInAt) fail('attendance_already_checked_in');

    const data = {
      checkInAt: at,
      checkInMethod: method,
      status: checkInStatus(config, local.minutesOfDay),
    };
    // A late arrival replaces an ABSENT / EXCUSED mark of the same day
    return existing
      ? this.repository.update(existing.id, data)
      : this.repository.create({
          ...data,
          branchId: student.branchId,
          studentId: student.id,
          date: dateOnly(local.date),
        });
  }

  private async markOut(dto: AttendanceMarkDto, method: AttendanceMethod) {
    const at = this.instant(dto.at);
    const local = getLocalParts(at, await this.clock.getTimezone());
    const record = await this.repository.findForDay(dto.studentId, local.date);
    if (!record?.checkInAt) fail('attendance_check_out_before_in');
    if (record!.checkOutAt) fail('attendance_already_checked_out');
    if (at <= record!.checkInAt!) fail('attendance_invalid_times');
    return this.repository.update(record!.id, {
      checkOutAt: at,
      checkOutMethod: method,
    });
  }

  /** Check in / out a whole section (or the given students); never fails as a whole. */
  async bulk(dto: BulkAttendanceDto) {
    const section = await this.sectionRepository.findById(dto.sectionId);
    Ensure.exists(section, 'Section');
    // Scope checked once for the whole section (role.md §8.6)
    await this.teacherScope.assertTeachesSection(section.id);
    const roster = await this.repository.findSectionStudents(section.id);
    const wanted = dto.studentIds ? new Set(dto.studentIds) : null;
    const targets = roster.filter((r) => !wanted || wanted.has(r.student.id));

    const result = {
      done: [] as number[],
      skipped: [] as { studentId: number; reason: string }[],
    };
    for (const { student } of targets) {
      try {
        const mark = { studentId: student.id };
        if (dto.action === 'check-in')
          await this.markIn(mark, AttendanceMethod.BULK);
        else await this.markOut(mark, AttendanceMethod.BULK);
        result.done.push(student.id);
      } catch (err: unknown) {
        result.skipped.push({
          studentId: student.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return result;
  }

  async excuse(dto: ExcuseDto) {
    await this.assertCanMark(dto.studentId);
    const student = await this.studentRepository.findById(dto.studentId);
    Ensure.exists(student, 'Student');
    const date = dto.date ?? (await this.clock.today());
    const existing = await this.repository.findForDay(student.id, date);
    const data = {
      status: AttendanceStatus.EXCUSED,
      note: dto.note?.trim() || null,
    };
    return existing
      ? this.repository.update(existing.id, data)
      : this.repository.create({
          ...data,
          branchId: student.branchId,
          studentId: student.id,
          date: dateOnly(date),
        });
  }

  /** Admin correction of times / status / note (audited). */
  async update(id: number, dto: UpdateAttendanceDto) {
    const record = await this.repository.findById(id);
    Ensure.exists(record, 'Attendance');
    await this.assertCanMark(record.studentId);
    const checkInAt =
      dto.checkInAt === undefined
        ? record.checkInAt
        : this.optionalInstant(dto.checkInAt);
    const checkOutAt =
      dto.checkOutAt === undefined
        ? record.checkOutAt
        : this.optionalInstant(dto.checkOutAt);
    if (checkOutAt && (!checkInAt || checkOutAt <= checkInAt))
      fail('attendance_invalid_times');

    let status = dto.status;
    if (!status && dto.checkInAt && checkInAt) {
      const local = getLocalParts(checkInAt, await this.clock.getTimezone());
      status = checkInStatus(await this.dayConfig(), local.minutesOfDay);
    }
    return this.repository.update(id, {
      checkInAt,
      checkOutAt,
      ...(status && { status }),
      ...(dto.note !== undefined && { note: dto.note?.trim() || null }),
    });
  }

  /** Section roster of a day with each student's record (null = not recorded yet). */
  async getDaily(query: DailyQueryDto) {
    const section = await this.sectionRepository.findById(query.sectionId);
    Ensure.exists(section, 'Section');
    await this.teacherScope.assertTeachesSection(section.id);
    const date = query.date ?? (await this.clock.today());
    const config = await this.dayConfig();
    const roster = await this.repository.findSectionStudents(section.id);
    const records = await this.repository.findManyForDay(
      roster.map((r) => r.student.id),
      date,
    );
    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    const rows = roster.map(({ student }) => ({
      student: {
        id: student.id,
        fullName: student.fullName,
        familyName: student.family?.familyName ?? null,
      },
      record: byStudent.get(student.id) ?? null,
    }));

    return {
      date,
      isWorkingDay: isWorkingDay(
        config,
        new Date(`${date}T12:00:00.000Z`).getUTCDay(),
      ),
      counts: countDay(rows.map((r) => r.record?.status ?? null)),
      rows,
    };
  }

  /** Student history between two local dates (default: last 30 days). */
  async getStudentHistory(studentId: number, query: StudentAttendanceQueryDto) {
    await this.assertCanMark(studentId);
    const to = query.to ?? (await this.clock.today());
    const from = query.from ?? shiftLocalDate(to, -30);
    const records = await this.repository.findForStudent(studentId, from, to);
    const counts = countDay(records.map((r) => r.status));
    return { from, to, counts: { ...counts, notRecorded: undefined }, records };
  }

  /**
   * Counters, rate and records of a student between two local dates
   * (inclusive). Rate = (PRESENT + LATE) / all recorded days, one decimal.
   */
  async getStudentPeriod(studentId: number, from: string, to: string) {
    await this.assertCanMark(studentId);
    const records = await this.repository.findForStudent(studentId, from, to);
    const counts = countDay(records.map((r) => r.status));
    const recorded =
      counts.present + counts.late + counts.absent + counts.excused;
    return {
      from,
      to,
      counts,
      ratePercent: attendanceRate(counts.present + counts.late, recorded),
      records,
    };
  }

  /** Whether a local date is a working day of the institute schedule. */
  async isWorkingDate(date: string): Promise<boolean> {
    return isWorkingDay(await this.dayConfig(), dayOfWeekOf(date));
  }

  /** Records of a local period for reports (D3): some students or one branch. */
  async getRecordsBetween(
    from: string,
    to: string,
    filter: { studentIds?: number[]; branchId?: number; take: number },
  ) {
    return this.repository.findBetween(from, to, filter);
  }

  /** Working days (0 = Sunday) of the institute schedule. */
  async getWorkingDays(): Promise<number[]> {
    return (await this.dayConfig()).workingDays;
  }

  /**
   * Dashboard: whether `today` is a working day, the attendance rate of the
   * last 7 working days, and who is recorded today (with which status).
   */
  async getOverview(today: string, branchId?: number) {
    const config = await this.dayConfig();
    const days = lastWorkingDays(today, 7, config.workingDays);
    const [rows, todayRecords] = await Promise.all([
      days.length > 0
        ? this.repository.countByDayAndStatus(days[0], today, branchId)
        : Promise.resolve([]),
      this.repository.findDayStatuses(today, branchId),
    ]);
    return {
      isWorkingDay: isWorkingDay(config, dayOfWeekOf(today)),
      week: attendanceSeries(rows, days),
      todayRecords,
    };
  }

  /**
   * Job: after the close time of a working day, mark students without a
   * record ABSENT. Idempotent; existing records are never changed.
   */
  async markAbsencesIfClosed(): Promise<number> {
    const config = await this.dayConfig();
    const local = await this.clock.localParts();
    if (!isWorkingDay(config, local.dayOfWeek)) return 0;
    if (local.minutesOfDay < closeMinutes(config)) return 0;
    return this.repository.markAbsences(local.date);
  }

  /**
   * Teacher scope: a teacher may only record students actively enrolled in
   * a section they teach in. No-op for every other role.
   */
  private async assertCanMark(studentId: number): Promise<void> {
    const taught = await this.teacherScope.taughtSectionIds();
    if (!taught) return;
    const sections = await this.repository.findActiveSectionIds(studentId);
    Ensure.forbidden(
      !sections.some((id) => taught.includes(id)),
      ErrorMessages.get('teacher_scope_section'),
    );
  }

  private async dayConfig(): Promise<AttendanceDayConfig> {
    return this.scheduleConfig.getConfig();
  }

  private instant(value?: string): Date {
    const at = value ? new Date(value) : new Date();
    if (at.getTime() > Date.now() + FUTURE_TOLERANCE_MS)
      fail('attendance_future_time');
    return at;
  }

  private optionalInstant(value: string | null): Date | null {
    return value === null ? null : this.instant(value);
  }
}

export type AttendanceRecord = DailyAttendance;
