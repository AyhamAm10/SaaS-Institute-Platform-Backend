import { Inject, Injectable } from '@nestjs/common';
import { ClosureScope, Notification } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../../common/time/timezone';
import { ClosureInfo } from '../closures/closures.rules';

export interface UpcomingLessonRow {
  entryId: number;
  teacherId: number;
  startTime: string;
  subjectName: string;
  sectionId: number;
  sectionName: string;
  branchId: number;
  roomName: string | null;
}

/**
 * State the lesson reminders read (read only): lessons of the current academic
 * year that start in a time window today, and the closures of the day. Closures
 * are read here (not through ClosuresService) because the closures module
 * already depends on notifications.
 */
@Injectable()
export class LessonRemindersRepository extends TenantAwareRepository<Notification> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'notification');
  }

  /** Lessons on `dayOfWeek` starting after `fromHm` and at or before `toHm` (zero-padded `HH:mm`). */
  async lessonsStartingBetween(dayOfWeek: number, fromHm: string, toHm: string): Promise<UpcomingLessonRow[]> {
    const rows = await this.client.timetableEntry.findMany({
      where: {
        instituteId: this.getInstituteId(),
        dayOfWeek,
        startTime: { gt: fromHm, lte: toHm },
        teacher: { isActive: true, deletedAt: null },
        timetable: { academicYear: { isCurrent: true }, section: { deletedAt: null } },
      },
      select: {
        id: true,
        teacherId: true,
        startTime: true,
        subject: { select: { name: true } },
        room: { select: { name: true } },
        timetable: { select: { section: { select: { id: true, name: true, branchId: true } } } },
      },
      take: 1000,
    });
    return rows.map((r: {
      id: number; teacherId: number; startTime: string; subject: { name: string }; room: { name: string } | null;
      timetable: { section: { id: number; name: string; branchId: number } };
    }) => ({
      entryId: r.id,
      teacherId: r.teacherId,
      startTime: r.startTime,
      subjectName: r.subject.name,
      sectionId: r.timetable.section.id,
      sectionName: r.timetable.section.name,
      branchId: r.timetable.section.branchId,
      roomName: r.room?.name ?? null,
    }));
  }

  /** Closures covering a local date, in the shape the closure rules expect. */
  async closuresOn(date: string): Promise<ClosureInfo[]> {
    const rows = await this.client.closure.findMany({
      where: { instituteId: this.getInstituteId(), fromDate: { lte: dateOnly(date) }, toDate: { gte: dateOnly(date) } },
      select: { id: true, scope: true, branchId: true, fromDate: true, toDate: true, reason: true, sections: { select: { sectionId: true } } },
    });
    return rows.map((c: {
      id: number; scope: ClosureScope; branchId: number | null; fromDate: Date; toDate: Date; reason: string;
      sections: { sectionId: number }[];
    }) => ({
      id: c.id,
      scope: c.scope,
      branchId: c.branchId,
      fromDate: c.fromDate.toISOString().slice(0, 10),
      toDate: c.toDate.toISOString().slice(0, 10),
      reason: c.reason,
      sectionIds: c.sections.map((s) => s.sectionId),
    }));
  }
}
