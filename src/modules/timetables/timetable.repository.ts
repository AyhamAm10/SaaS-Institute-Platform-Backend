import { Inject, Injectable } from '@nestjs/common';
import { Timetable } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TimetableRepository extends TenantAwareRepository<Timetable> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'timetable');
  }

  async findBySectionAndYear(
    sectionId: number,
    academicYearId: number,
  ): Promise<Timetable | null> {
    const instituteId = this.getInstituteId();
    return (this.client as any).timetable.findFirst({
      where: { instituteId, sectionId, academicYearId },
    });
  }

  async findWithEntries(id: number) {
    const instituteId = this.getInstituteId();
    return (this.client as any).timetable.findFirst({
      where: { id, instituteId },
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
    const instituteId = this.getInstituteId();
    return (this.client as any).timetable.findMany({
      where: { instituteId, academicYearId },
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
