import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Student } from '@prisma/client';
import { ContextScopedRepository } from '../../database/context-scoped.repository';
import { PrismaService } from '../../database/prisma.service';
import { StudentQueryDto } from './dto/student-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

@Injectable()
export class StudentRepository extends ContextScopedRepository<Student> {
  protected override readonly branchKey = 'branchId';

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'student');
  }

  async findFiltered(query: StudentQueryDto): Promise<PaginatedResult<any>> {
    const instituteId = this.getInstituteId();
    const where: Prisma.StudentWhereInput = { instituteId };

    if (query.branchId !== undefined) {
      where.branchId = query.branchId;
    }

    if (query.familyId !== undefined) {
      where.familyId = query.familyId;
    }

    if (query.sectionId !== undefined) {
      where.studentEnrollments = {
        some: {
          sectionId: query.sectionId,
        },
      };
    }

    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { family: { familyName: { contains: q, mode: 'insensitive' } } },
        { family: { fatherName: { contains: q, mode: 'insensitive' } } },
        { family: { phone: { contains: q } } },
      ];
    }

    const scopedWhere = this.scopeWhere(where as Record<string, unknown>);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      (this.client as any).student.findMany({
        where: scopedWhere,
        include: {
          family: {
            select: {
              id: true,
              familyName: true,
              fatherName: true,
              motherName: true,
              phone: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          studentEnrollments: {
            include: {
              section: {
                select: {
                  id: true,
                  name: true,
                  grade: true,
                },
              },
              academicYear: {
                select: {
                  id: true,
                  name: true,
                  isCurrent: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      (this.client as any).student.count({
        where: scopedWhere,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages: totalPages > 0 ? totalPages : 1,
    };
  }

  async findStudentById(id: number): Promise<any | null> {
    const instituteId = this.getInstituteId();
    return (this.client as any).student.findFirst({
      where: this.scopeWhere({ id, instituteId }),
      include: {
        family: true,
        branch: true,
        studentEnrollments: {
          include: {
            section: true,
            academicYear: true,
          },
        },
        examResults: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        lessonAttendance: {
          take: 15,
          orderBy: { markedAt: 'desc' },
        },
      },
    });
  }
}
