import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Teacher } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

@Injectable()
export class TeacherRepository extends TenantAwareRepository<Teacher> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'teacher');
  }

  /**
   * Find teacher by ID without tenant scoping (cross-tenant safety checks).
   */
  async findRawById(id: number): Promise<Teacher | null> {
    return (this.client as any).teacher.findUnique({
      where: { id },
    });
  }

  /**
   * Find teacher by User ID within current tenant.
   */
  async findByUserId(userId: number): Promise<Teacher | null> {
    return this.findOne({ userId });
  }

  /**
   * Find teacher by ID with full details (user, branches, qualifications, availabilities).
   */
  async findByIdWithDetails(id: number) {
    const instituteId = this.getInstituteId();
    return (this.client as any).teacher.findFirst({
      where: { id, instituteId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            role: true,
            createdAt: true,
          },
        },
        branchTeachers: {
          include: {
            branch: true,
          },
        },
        assignments: {
          include: {
            academicBranch: true,
            subject: true,
          },
        },
        availabilities: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        _count: {
          select: {
            assignments: true,
            sectionSubjects: true,
            timetableEntries: true,
          },
        },
      },
    });
  }

  /**
   * Paginated list of teachers with dynamic filters.
   */
  async findAllFiltered(query: TeacherQueryDto): Promise<PaginatedResult<any>> {
    const instituteId = this.getInstituteId();
    const where: Prisma.TeacherWhereInput = {
      instituteId,
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { user: { fullName: { contains: s, mode: 'insensitive' } } },
        { user: { phone: { contains: s, mode: 'insensitive' } } },
        { specialization: { contains: s, mode: 'insensitive' } },
      ];
    }

    if (query.branchId) {
      where.branchTeachers = {
        some: { branchId: query.branchId },
      };
    }

    if (query.academicBranchId || query.subjectId) {
      where.assignments = {
        some: {
          ...(query.academicBranchId ? { academicBranchId: query.academicBranchId } : {}),
          ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        },
      };
    }

    return this.findManyPaginated(query, {
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            role: true,
            createdAt: true,
          },
        },
        assignments: {
          include: {
            academicBranch: true,
            subject: true,
          },
        },
        availabilities: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        _count: {
          select: {
            assignments: true,
            sectionSubjects: true,
            timetableEntries: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });
  }
}
