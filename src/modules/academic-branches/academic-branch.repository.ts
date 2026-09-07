import { Inject, Injectable } from '@nestjs/common';
import { AcademicBranch } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

/**
 * Tenant-scoped repository for AcademicBranch entities.
 *
 * All operations are automatically scoped to the current institute
 * through TenantAwareRepository.
 */
@Injectable()
export class AcademicBranchRepository extends TenantAwareRepository<AcademicBranch> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'academicBranch');
  }

  /**
   * Find an academic branch by name within the current tenant.
   */
  async findByName(name: string): Promise<AcademicBranch | null> {
    return this.findOne({ name });
  }

  /**
   * Find an academic branch by ID globally (system-level without tenant scoping).
   * Used strictly for cross-tenant validation checks.
   */
  async findRawById(id: number): Promise<AcademicBranch | null> {
    return this.delegate.findUnique({ where: { id } }) as Promise<AcademicBranch | null>;
  }

  /**
   * Count sections linked to this academic branch.
   */
  async countSections(academicBranchId: number): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).section.count({
      where: {
        academicBranchId,
        instituteId: this.getInstituteId(),
      },
    });
  }

  /**
   * Paginated list of academic branches with optional search.
   */
  async findAllPaginated(
    pagination: PaginationQueryDto,
    search?: string,
  ): Promise<PaginatedResult<AcademicBranch>> {
    const where: Record<string, unknown> = {};
    if (search !== undefined && search.trim() !== '') {
      where['name'] = { contains: search.trim(), mode: 'insensitive' };
    }

    return this.findManyPaginated(pagination, {
      where,
      include: {
        _count: {
          select: {
            sections: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }
}
