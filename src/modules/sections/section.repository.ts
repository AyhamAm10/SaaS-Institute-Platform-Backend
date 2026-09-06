import { Inject, Injectable } from '@nestjs/common';
import { Section } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { SectionQueryDto } from './dto/section-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

/**
 * Tenant-scoped repository for Section entities.
 *
 * All operations are automatically scoped to the current institute
 * through TenantAwareRepository.
 */
@Injectable()
export class SectionRepository extends TenantAwareRepository<Section> {
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
    return this.delegate.findUnique({ where: { id } }) as Promise<Section | null>;
  }

  /**
   * Retrieve full details of a section with related branch, academic year,
   * and summary counts, scoped strictly to the current tenant.
   */
  async findByIdWithDetails(id: number): Promise<Record<string, unknown> | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).section.findFirst({
      where: {
        id,
        instituteId: this.getInstituteId(),
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
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
          select: { id: true, name: true, code: true },
        },
        academicYear: {
          select: { id: true, name: true, isCurrent: true },
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
