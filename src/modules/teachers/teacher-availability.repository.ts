import { Inject, Injectable } from '@nestjs/common';
import { TeacherAvailability } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TeacherAvailabilityRepository extends TenantAwareRepository<TeacherAvailability> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'teacherAvailability');
  }

  /**
   * List all availability intervals for a teacher.
   */
  async findByTeacher(teacherId: number): Promise<TeacherAvailability[]> {
    const instituteId = this.getInstituteId();
    return (this.client as any).teacherAvailability.findMany({
      where: { instituteId, teacherId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  /**
   * Replace all availability intervals for a teacher in a single operation.
   */
  async replaceAvailabilities(
    teacherId: number,
    windows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  ): Promise<TeacherAvailability[]> {
    const instituteId = this.getInstituteId();
    const client = this.client as any;

    await client.teacherAvailability.deleteMany({
      where: { instituteId, teacherId },
    });

    if (windows.length === 0) {
      return [];
    }

    await client.teacherAvailability.createMany({
      data: windows.map((w) => ({
        instituteId,
        teacherId,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
      })),
    });

    return this.findByTeacher(teacherId);
  }
}
