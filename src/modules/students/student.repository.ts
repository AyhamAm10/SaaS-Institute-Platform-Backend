import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Student } from '@prisma/client';
import { ContextScopedRepository } from '../../database/context-scoped.repository';
import { PrismaService } from '../../database/prisma.service';
import { StudentQueryDto } from './dto/student-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { StudentDeletionReport } from './dto/student-deletion-report.dto';

/** Reference-data links returned with every student (id + display fields). */
const STUDENT_REFERENCE_INCLUDE = {
  city: { select: { id: true, name: true } },
  school: { select: { id: true, name: true } },
  bus: { select: { id: true, name: true } },
  knowWay: { select: { id: true, name: true } },
  status: { select: { id: true, name: true, tone: true } },
} as const;

@Injectable()
export class StudentRepository extends ContextScopedRepository<Student> {
  protected override readonly branchKey = 'branchId';
  protected override readonly softDelete = true;
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'student');
  }

  /**
   * Students of the header branch and context year.
   * `contextYearId` (header year, else current year) restricts the list to
   * students enrolled in that year plus new students never enrolled anywhere
   * (or, with `unassigned`, students not enrolled in that year).
   * null = no year yet (falls back to all branch students).
   */
  async findFiltered(
    query: StudentQueryDto,
    contextYearId: number | null,
    customFilters?: Record<string, unknown>,
  ): Promise<PaginatedResult<any>> {
    const instituteId = this.getInstituteId();
    const where: Prisma.StudentWhereInput = { instituteId };

    if (query.familyId !== undefined) {
      where.familyId = query.familyId;
    }
    if (query.statusId !== undefined) where.statusId = query.statusId;
    if (query.busId !== undefined) where.busId = query.busId;
    if (query.cityId !== undefined) where.cityId = query.cityId;
    if (query.schoolId !== undefined) where.schoolId = query.schoolId;
    if (query.knowWayId !== undefined) where.knowWayId = query.knowWayId;

    const andConditions: Prisma.StudentWhereInput[] = [];
    if (query.sectionId !== undefined) {
      andConditions.push({
        studentEnrollments: { some: { sectionId: query.sectionId } },
      });
    } else if (query.unassigned && contextYearId !== null) {
      andConditions.push({
        studentEnrollments: { none: { academicYearId: contextYearId } },
      });
    } else if (contextYearId !== null) {
      // Enrolled in the year, or registered but never enrolled yet (a new
      // student must not vanish until they are added to a section)
      andConditions.push({
        OR: [
          { studentEnrollments: { some: { academicYearId: contextYearId } } },
          { studentEnrollments: { none: {} } },
        ],
      });
    }

    if (customFilters && Object.keys(customFilters).length > 0) {
      for (const [key, value] of Object.entries(customFilters)) {
        andConditions.push({
          customFields: {
            path: [key],
            equals: value as Prisma.InputJsonValue,
          },
        });
      }
    }

    if (andConditions.length > 0) where.AND = andConditions;

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
            },
          },
          ...STUDENT_REFERENCE_INCLUDE,
          // Only the enrollment of the context year (one per student per year)
          studentEnrollments: {
            where: { academicYearId: contextYearId ?? -1 },
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
        ...STUDENT_REFERENCE_INCLUDE,
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

  /** Students without an enrollment in the year (branch from the header). */
  async countUnassigned(academicYearId: number): Promise<number> {
    return this.count({ studentEnrollments: { none: { academicYearId } } });
  }

  /** Students registered since an instant (branch from the header). */
  async countCreatedSince(since: Date): Promise<number> {
    return this.count({ createdAt: { gte: since } });
  }

  /** Counts of records attached to a student (used before soft delete). */
  async getDeletionReport(studentId: number): Promise<StudentDeletionReport> {
    const instituteId = this.getInstituteId();
    const where = { instituteId, studentId };
    const [
      enrollments,
      examResults,
      lessonAttendance,
      subscriptions,
      payments,
    ] = await Promise.all([
      (this.client as any).studentEnrollment.count({ where }),
      (this.client as any).examResult.count({ where }),
      (this.client as any).lessonAttendance.count({ where }),
      (this.client as any).studentSubscription.count({ where }),
      (this.client as any).payment.count({
        where: { instituteId, subscription: { studentId } },
      }),
    ]);
    return {
      studentId,
      enrollments,
      examResults,
      lessonAttendance,
      subscriptions,
      payments,
    };
  }
}
