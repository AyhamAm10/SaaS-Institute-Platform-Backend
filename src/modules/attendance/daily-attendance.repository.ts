import { Inject, Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  DailyAttendance,
  EnrollmentStatus,
} from '@prisma/client';
import { ContextScopedRepository } from '../../database/context-scoped.repository';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../../common/time/timezone';
import { DayStatusCount } from './attendance.rules';

/**
 * Daily check-in / check-out records (one per student per local day).
 * Audited: time / status corrections are written to AuditLog.
 */
@Injectable()
export class DailyAttendanceRepository extends ContextScopedRepository<DailyAttendance> {
  // Header branch (role.md §3); days are local dates, not academic years
  protected override readonly branchKey = 'branchId';
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'dailyAttendance');
  }

  async findForDay(
    studentId: number,
    date: string,
  ): Promise<DailyAttendance | null> {
    return this.findOne({ studentId, date: dateOnly(date) });
  }

  async findManyForDay(
    studentIds: number[],
    date: string,
  ): Promise<DailyAttendance[]> {
    if (studentIds.length === 0) return [];
    return this.findMany({
      where: { studentId: { in: studentIds }, date: dateOnly(date) },
    });
  }

  async findForStudent(
    studentId: number,
    from: string,
    to: string,
  ): Promise<DailyAttendance[]> {
    return this.findMany({
      where: { studentId, date: { gte: dateOnly(from), lte: dateOnly(to) } },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Students that may check in: an ACTIVE enrollment (any year) and not
   * soft-deleted. Explicit query: attendance is not scoped by the year header.
   */
  async isActivelyEnrolled(studentId: number): Promise<boolean> {
    const count = await this.client.studentEnrollment.count({
      where: {
        instituteId: this.getInstituteId(),
        studentId,
        status: EnrollmentStatus.ACTIVE,
        student: { deletedAt: null },
      },
    });
    return count > 0;
  }

  /** Sections where the student has an ACTIVE enrollment (teacher scope). */
  async findActiveSectionIds(studentId: number): Promise<number[]> {
    const rows: { sectionId: number }[] =
      await this.client.studentEnrollment.findMany({
        where: {
          instituteId: this.getInstituteId(),
          studentId,
          status: EnrollmentStatus.ACTIVE,
        },
        select: { sectionId: true },
      });
    return rows.map((r) => r.sectionId);
  }

  /** Active students of a section (the daily roster). */
  async findSectionStudents(sectionId: number) {
    return this.client.studentEnrollment.findMany({
      where: {
        instituteId: this.getInstituteId(),
        sectionId,
        status: EnrollmentStatus.ACTIVE,
        student: { deletedAt: null },
      },
      select: {
        student: {
          select: {
            id: true,
            fullName: true,
            branchId: true,
            family: { select: { familyName: true } },
          },
        },
      },
      orderBy: { student: { fullName: 'asc' } },
    }) as Promise<
      {
        student: {
          id: number;
          fullName: string;
          branchId: number;
          family: { familyName: string } | null;
        };
      }[]
    >;
  }

  /** (date, status) counts between two local dates, optionally one branch. */
  async countByDayAndStatus(
    from: string,
    to: string,
    branchId?: number,
  ): Promise<DayStatusCount[]> {
    const rows: {
      date: Date;
      status: AttendanceStatus;
      _count: { _all: number };
    }[] = await this.client.dailyAttendance.groupBy({
      by: ['date', 'status'],
      where: {
        instituteId: this.getInstituteId(),
        date: { gte: dateOnly(from), lte: dateOnly(to) },
        ...(branchId && { branchId }),
      },
      _count: { _all: true },
    });
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      count: r._count._all,
    }));
  }

  /** Who is recorded on a day and how (dashboard per-section counters). */
  async findDayStatuses(
    date: string,
    branchId?: number,
  ): Promise<{ studentId: number; status: AttendanceStatus }[]> {
    return this.client.dailyAttendance.findMany({
      where: {
        instituteId: this.getInstituteId(),
        date: dateOnly(date),
        ...(branchId && { branchId }),
      },
      select: { studentId: true, status: true },
    });
  }

  /**
   * Marks ABSENT every actively enrolled student without a record on `date`.
   * Never touches an existing record (skipDuplicates on the unique key).
   */
  async markAbsences(date: string): Promise<number> {
    const instituteId = this.getInstituteId();
    const students: { id: number; branchId: number }[] =
      await this.client.student.findMany({
        where: {
          instituteId,
          deletedAt: null,
          studentEnrollments: { some: { status: EnrollmentStatus.ACTIVE } },
        },
        select: { id: true, branchId: true },
      });
    if (students.length === 0) return 0;
    const result = await this.client.dailyAttendance.createMany({
      data: students.map((s) => ({
        instituteId,
        branchId: s.branchId,
        studentId: s.id,
        date: dateOnly(date),
        status: AttendanceStatus.ABSENT,
      })),
      skipDuplicates: true,
    });
    return result.count as number;
  }

  /**
   * Records between two local dates (inclusive) for reports (D3), optionally
   * only some students or one branch.
   */
  async findBetween(
    from: string,
    to: string,
    filter: { studentIds?: number[]; branchId?: number; take: number },
  ): Promise<
    {
      studentId: number;
      date: Date;
      status: AttendanceStatus;
      checkInAt: Date | null;
      checkOutAt: Date | null;
      note: string | null;
    }[]
  > {
    if (filter.studentIds && filter.studentIds.length === 0) return [];
    return this.client.dailyAttendance.findMany({
      where: this.scopeWhere({
        date: { gte: dateOnly(from), lte: dateOnly(to) },
        ...(filter.studentIds && { studentId: { in: filter.studentIds } }),
        ...(filter.branchId && { branchId: filter.branchId }),
      }),
      select: {
        studentId: true,
        date: true,
        status: true,
        checkInAt: true,
        checkOutAt: true,
        note: true,
      },
      orderBy: [{ date: 'asc' }, { studentId: 'asc' }],
      take: filter.take,
    });
  }
}
