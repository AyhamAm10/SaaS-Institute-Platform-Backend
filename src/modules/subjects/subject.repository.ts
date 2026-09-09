import { Inject, Injectable } from '@nestjs/common';
import { Subject } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

/**
 * Tenant-scoped repository for Subject entities.
 *
 * All operations are automatically scoped to the current institute
 * through TenantAwareRepository.
 */
@Injectable()
export class SubjectRepository extends TenantAwareRepository<Subject> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'subject');
  }

  /**
   * Find a subject by code within the current tenant.
   */
  async findByCode(code: string): Promise<Subject | null> {
    return this.findOne({ code });
  }

  /**
   * Find a subject by name within the current tenant.
   */
  async findByName(name: string): Promise<Subject | null> {
    return this.findOne({ name });
  }

  /**
   * Find a subject by ID globally (without tenant scoping).
   * Strictly used for detecting cross-tenant access/mismatches.
   */
  async findRawById(id: number): Promise<Subject | null> {
    return this.delegate.findUnique({ where: { id } }) as Promise<Subject | null>;
  }

  /**
   * Count sections linked to this subject within the current tenant.
   */
  async countSectionSubjects(subjectId: number): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).sectionSubject.count({
      where: {
        subjectId,
        instituteId: this.getInstituteId(),
      },
    });
  }

  /**
   * Paginated list of subjects with optional search on name or code.
   */
  async findAllPaginated(
    pagination: PaginationQueryDto,
    search?: string,
  ): Promise<PaginatedResult<Subject>> {
    const where: Record<string, unknown> = {};
    if (search !== undefined && search.trim() !== '') {
      where['OR'] = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { code: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.findManyPaginated(pagination, {
      where,
      include: {
        _count: {
          select: {
            sectionSubjects: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });
  }
}
