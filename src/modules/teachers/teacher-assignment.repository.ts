import { Inject, Injectable } from '@nestjs/common';
import { TeacherAssignment } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TeacherAssignmentRepository extends TenantAwareRepository<TeacherAssignment> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'teacherAssignment');
  }

  /**
   * Find specific qualification assignment.
   */
  async findByTeacherBranchSubject(
    teacherId: number,
    academicBranchId: number,
    subjectId: number,
  ): Promise<TeacherAssignment | null> {
    const instituteId = this.getInstituteId();
    return (this.client as any).teacherAssignment.findFirst({
      where: {
        instituteId,
        teacherId,
        academicBranchId,
        subjectId,
      },
    });
  }

  /**
   * List all qualifications for a teacher.
   */
  async findByTeacher(teacherId: number): Promise<TeacherAssignment[]> {
    const instituteId = this.getInstituteId();
    return (this.client as any).teacherAssignment.findMany({
      where: { instituteId, teacherId },
      include: {
        academicBranch: true,
        subject: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Remove a qualification assignment by ID.
   */
  async deleteAssignment(id: number): Promise<void> {
    const instituteId = this.getInstituteId();
    await (this.client as any).teacherAssignment.deleteMany({
      where: { id, instituteId },
    });
  }
}
