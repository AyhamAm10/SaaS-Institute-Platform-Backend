import { Inject, Injectable } from '@nestjs/common';
import { Section } from '@prisma/client';
import { ContextScopedRepository } from '../../database/context-scoped.repository';
import { PrismaService } from '../../database/prisma.service';
import { SectionQueryDto } from './dto/section-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

/**
 * Context-scoped repository for Section entities.
 *
 * Scoped automatically to current institute, and optionally to active academicYearId
 * and branchId from RequestContext.
 */
@Injectable()
export class SectionRepository extends ContextScopedRepository<Section> {
  protected override readonly yearKey = 'academicYearId';
  protected override readonly branchKey = 'branchId';

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'section');
  }

  /**
   * Find a section by compound uniqueness (branchId, academicYearId, name)
   * within the current tenant.
   */
  async findByNameAndBranch(
    branchId: number,
    academicYearId: number,
    name: string,
  ): Promise<Section | null> {
    return this.findOne({
      branchId,
      academicYearId,
      name,
    });
  }

  /**
   * Find a section by ID globally (system-level without tenant scoping).
   * Used strictly for cross-tenant validation checks.
   */
  async findRawById(id: number): Promise<Section | null> {
    return this.delegate.findUnique({
      where: { id },
    }) as Promise<Section | null>;
  }

  /**
   * Retrieve full details of a section with related branch, academic year,
   * and summary counts, scoped strictly to the current tenant.
   */
  async findByIdWithDetails(
    id: number,
  ): Promise<Record<string, unknown> | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).section.findFirst({
      where: this.scopeWhere({ id }),
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            isCurrent: true,
          },
        },
        academicBranch: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            studentEnrollments: true,
            sectionSubjects: true,
            sectionTeachers: true,
            timetables: true,
          },
        },
      },
    });
  }

  /**
   * Find all sections belonging to a specific academic year within the current tenant.
   */
  async findByAcademicYear(academicYearId: number): Promise<Section[]> {
    return this.findMany({
      where: { academicYearId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Paginated list of sections with filters.
   */
  async findAllFiltered(
    query: SectionQueryDto,
  ): Promise<PaginatedResult<Section>> {
    const where: Record<string, unknown> = {};

    if (query.academicYearId !== undefined) {
      where['academicYearId'] = query.academicYearId;
    }
    if (query.branchId !== undefined) {
      where['branchId'] = query.branchId;
    }
    if (query.academicBranchId !== undefined) {
      where['academicBranchId'] = query.academicBranchId;
    }
    if (query.grade !== undefined && query.grade !== '') {
      where['grade'] = query.grade;
    }
    if (query.search !== undefined && query.search !== '') {
      where['name'] = { contains: query.search, mode: 'insensitive' };
    }

    return this.findManyPaginated(query, {
      where,
      include: {
        branch: {
          select: { id: true, name: true },
        },
        academicYear: {
          select: { id: true, name: true, isCurrent: true },
        },
        academicBranch: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            studentEnrollments: true,
            sectionSubjects: true,
            sectionTeachers: true,
          },
        },
      },
      orderBy: [{ academicYearId: 'desc' }, { name: 'asc' }],
    });
  }
}
