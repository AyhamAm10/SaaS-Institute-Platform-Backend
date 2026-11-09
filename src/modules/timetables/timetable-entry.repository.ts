import { Inject, Injectable } from '@nestjs/common';
import { TimetableEntry } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TimetableEntryRepository extends TenantAwareRepository<TimetableEntry> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'timetableEntry');
  }

  async findByTimetable(timetableId: number) {
    const instituteId = this.getInstituteId();
    return (this.client as any).timetableEntry.findMany({
      where: { instituteId, timetableId },
      include: {
        subject: true,
        teacher: {
          include: {
            user: { select: { id: true, fullName: true, phone: true } },
          },
        },
        room: true,
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { periodNumber: 'asc' },
        { startTime: 'asc' },
      ],
    });
  }

  /**
   * Entries of a year for reports (D3): one section, one teacher, or all
   * (teacher load), with section, subject, teacher and room names.
   */
  async findForReport(
    academicYearId: number,
    filter: { sectionId?: number; teacherId?: number; branchId?: number },
  ): Promise<ReportTimetableEntry[]> {
    return (this.client as any).timetableEntry.findMany({
      where: {
        instituteId: this.getInstituteId(),
        ...(filter.teacherId && { teacherId: filter.teacherId }),
        timetable: {
          academicYearId,
          ...(filter.sectionId && { sectionId: filter.sectionId }),
          ...(filter.branchId && { section: { branchId: filter.branchId } }),
        },
      },
      select: {
        id: true,
        dayOfWeek: true,
        periodNumber: true,
        startTime: true,
        endTime: true,
        timetable: { select: { section: { select: { id: true, name: true } } } },
        subject: { select: { id: true, name: true } },
        teacher: {
          select: { id: true, user: { select: { fullName: true } } },
        },
        room: { select: { name: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findInstituteEntriesForYear(academicYearId: number) {
    const instituteId = this.getInstituteId();
    return (this.client as any).timetableEntry.findMany({
      where: {
        instituteId,
        timetable: {
          academicYearId,
        },
      },
      include: {
        timetable: {
          select: { sectionId: true },
        },
        subject: true,
        teacher: {
          include: {
            user: { select: { id: true, fullName: true, phone: true } },
          },
        },
        room: true,
      },
    });
  }

  async replaceUnlockedEntries(
    timetableId: number,
    entries: Array<{
      subjectId: number;
      teacherId: number;
      roomId: number | null;
      dayOfWeek: number;
      periodNumber: number;
      startTime: string;
      endTime: string;
      isLocked?: boolean;
    }>,
  ) {
    const instituteId = this.getInstituteId();
    const client = this.client as any;

    // Delete non-locked entries
    await client.timetableEntry.deleteMany({
      where: {
        instituteId,
        timetableId,
        isLocked: false,
      },
    });

    if (entries.length > 0) {
      await client.timetableEntry.createMany({
        data: entries.map((e) => ({
          instituteId,
          timetableId,
          subjectId: e.subjectId,
          teacherId: e.teacherId,
          roomId: e.roomId,
          dayOfWeek: e.dayOfWeek,
          periodNumber: e.periodNumber,
          startTime: e.startTime,
          endTime: e.endTime,
          isLocked: Boolean(e.isLocked),
        })),
      });
    }

    return this.findByTimetable(timetableId);
  }

  async createEntry(
    timetableId: number,
    data: {
      subjectId: number;
      teacherId: number;
      roomId?: number | null;
      dayOfWeek: number;
      periodNumber?: number;
      startTime: string;
      endTime: string;
      isLocked?: boolean;
    },
  ) {
    return this.create({
      timetableId,
      subjectId: data.subjectId,
      teacherId: data.teacherId,
      roomId: data.roomId || null,
      dayOfWeek: data.dayOfWeek,
      periodNumber: data.periodNumber || 1,
      startTime: data.startTime,
      endTime: data.endTime,
      isLocked: Boolean(data.isLocked),
    });
  }

  async updateEntry(
    id: number,
    data: {
      subjectId?: number;
      teacherId?: number;
      roomId?: number | null;
      dayOfWeek?: number;
      periodNumber?: number;
      startTime?: string;
      endTime?: string;
      isLocked?: boolean;
    },
  ) {
    return this.update(id, data);
  }

  async toggleLock(id: number, isLocked: boolean) {
    return this.update(id, { isLocked });
  }

  async deleteEntry(id: number): Promise<void> {
    await this.delete(id);
  }
}

/** Timetable entry as the reports read it (D3). */
export interface ReportTimetableEntry {
  id: number;
  dayOfWeek: number;
  periodNumber: number | null;
  startTime: string;
  endTime: string;
  timetable: { section: { id: number; name: string } };
  subject: { id: number; name: string };
  teacher: { id: number; user: { fullName: string } };
  room: { name: string } | null;
}
