import { Inject, Injectable } from '@nestjs/common';
import { StudentEnrollment } from '@prisma/client';
import { ContextScopedRepository } from '../../database/context-scoped.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class StudentEnrollmentRepository extends ContextScopedRepository<StudentEnrollment> {
  protected override readonly yearKey = 'academicYearId';

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'studentEnrollment');
  }

  async findByStudentAndYear(
    studentId: number,
    academicYearId: number,
  ): Promise<StudentEnrollment | null> {
    const instituteId = this.getInstituteId();
    return (this.client as any).studentEnrollment.findFirst({
      where: { instituteId, studentId, academicYearId },
    });
  }

  async enroll(data: {
    studentId: number;
    sectionId: number;
    academicYearId: number;
    status?: string;
  }): Promise<StudentEnrollment> {
    const instituteId = this.getInstituteId();
    return (this.client as any).studentEnrollment.create({
      data: {
        instituteId,
        studentId: data.studentId,
        sectionId: data.sectionId,
        academicYearId: data.academicYearId,
        enrolledAt: new Date(),
        status: data.status || 'ACTIVE',
      },
      include: {
        section: true,
        academicYear: true,
      },
    });
  }
}
