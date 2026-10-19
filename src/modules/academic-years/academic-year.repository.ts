import { Inject, Injectable } from '@nestjs/common';
import { AcademicYear } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';
import { RequestContext } from '../../context/request-context';

/**
 * Tenant-scoped repository for AcademicYear entities.
 *
 * All queries are automatically scoped to the current institute
 * via TenantAwareRepository.
 */
@Injectable()
export class AcademicYearRepository extends TenantAwareRepository<AcademicYear> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'academicYear');
  }

  /**
   * Find an academic year by name within the current tenant.
   */
  async findByName(name: string): Promise<AcademicYear | null> {
    return this.findOne({ name });
  }

  /**
   * Find the current academic year for the tenant.
   */
  async findCurrentYear(): Promise<AcademicYear | null> {
    return this.findOne({ isCurrent: true });
  }

  /**
   * Get the current active academic year for the tenant.
   * If none is explicitly marked as isCurrent, falls back to the latest academic year.
   * If no academic years exist for this institute, creates a default current year.
   */
  async getOrCreateCurrentYear(): Promise<AcademicYear> {
    const current = await this.findCurrentYear();
    if (current) {
      return current;
    }

    const latestYears = await this.findMany({
      orderBy: { endDate: 'desc' },
      take: 1,
    });
    if (latestYears.length > 0) {
      return latestYears[0];
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    return this.create({
      name: `${currentYear} - ${currentYear + 1}`,
      startDate: new Date(currentYear, 8, 1),
      endDate: new Date(currentYear + 1, 5, 30),
      isCurrent: true,
    });
  }

  /**
   * Check for overlapping date ranges within the tenant.
   * Two years overlap if: existingStart < newEnd AND existingEnd > newStart
   *
   * @param startDate - Start of the range to check
   * @param endDate   - End of the range to check
   * @param excludeId - Optional ID to exclude (for update operations)
   */
  async findOverlapping(
    startDate: Date,
    endDate: Date,
    excludeId?: number,
  ): Promise<AcademicYear | null> {
    const where: Record<string, unknown> = {
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    };
    if (excludeId !== undefined) {
      where['id'] = { not: excludeId };
    }
    return this.findOne(where);
  }

  /**
   * Unset isCurrent on all academic years for the current tenant.
   * Uses updateMany via the raw client for bulk operations.
   */
  async unsetCurrentYear(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.client as any).academicYear.updateMany({
      where: { instituteId: this.getInstituteId(), isCurrent: true },
      data: { isCurrent: false },
    });
  }

  /**
   * Find an academic year by ID globally (system-level without tenant scoping).
   * Used strictly for cross-tenant validation checks.
   */
  async findRawById(id: number): Promise<AcademicYear | null> {
    return this.delegate.findUnique({
      where: { id },
    }) as Promise<AcademicYear | null>;
  }

  /**
   * Acquire an exclusive row lock on the institute record for the duration
   * of the interactive transaction.
   * This serializes current-year switching per tenant, preventing race conditions.
   */
  async lockInstituteForUpdate(): Promise<void> {
    const instituteId = this.getInstituteId();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.client as any)
      .$executeRaw`SELECT id FROM institutes WHERE id = ${instituteId} FOR UPDATE`;
  }

  /**
   * Paginated listing with ordering.
   */
  async findAllPaginated(
    pagination: PaginationQueryDto,
    search?: string,
  ): Promise<PaginatedResult<AcademicYear>> {
    const where: Record<string, unknown> = {};
    if (search) {
      where['name'] = { contains: search, mode: 'insensitive' };
    }

    return this.findManyPaginated(pagination, {
      where,
      orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
    });
  }

  /**
   * Find all sections belonging to a specific academic year within the current tenant,
   * scoped to the branch if specified via argument or RequestContext header.
   */
  async findSections(
    academicYearId: number,
    branchId?: number,
  ): Promise<unknown[]> {
    const effectiveBranchId = branchId ?? RequestContext.getBranchId();
    const where: Record<string, unknown> = {
      academicYearId,
      instituteId: this.getInstituteId(),
    };
    if (effectiveBranchId !== undefined) {
      where['branchId'] = effectiveBranchId;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).section.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            studentEnrollments: true,
            sectionSubjects: true,
            sectionTeachers: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
