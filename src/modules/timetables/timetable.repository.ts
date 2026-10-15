import { Inject, Injectable } from '@nestjs/common';
import { Timetable } from '@prisma/client';
import { ContextScopedRepository } from '../../database/context-scoped.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TimetableRepository extends ContextScopedRepository<Timetable> {
  protected override readonly yearKey = 'academicYearId';
  protected override readonly branchKey = 'section.branchId';

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'timetable');
  }

  async findBySectionAndYear(
    sectionId: number,
    academicYearId: number,
  ): Promise<Timetable | null> {
    return (this.client as any).timetable.findFirst({
      where: this.scopeWhere({ sectionId, academicYearId }),
    });
  }

  async findWithEntries(id: number) {
    return (this.client as any).timetable.findFirst({
      where: this.scopeWhere({ id }),
      include: {
        section: {
          include: {
            academicBranch: true,
            branch: true,
          },
        },
        academicYear: true,
        entries: {
          include: {
            subject: true,
            teacher: {
              include: {
                user: {
                  select: { id: true, fullName: true, phone: true },
                },
              },
            },
            room: true,
          },
          orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }, { startTime: 'asc' }],
        },
      },
    });
  }

  async upsertTimetable(
    academicYearId: number,
    sectionId: number,
    name: string,
  ): Promise<Timetable> {
    const instituteId = this.getInstituteId();
    return (this.client as any).timetable.upsert({
      where: {
        instituteId_academicYearId_sectionId: {
          instituteId,
          academicYearId,
          sectionId,
        },
      },
      create: {
        instituteId,
        academicYearId,
        sectionId,
        name,
      },
      update: {
        name,
      },
    });
  }

  async findAllForYear(academicYearId: number) {
    return this.findMany({
      where: { academicYearId },
      include: {
        section: true,
        entries: {
          include: {
            subject: true,
            teacher: {
              include: {
                user: {
                  select: { id: true, fullName: true, phone: true },
                },
              },
            },
            room: true,
          },
          orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
        },
      },
    });
  }
}
