import { Inject, Injectable } from '@nestjs/common';
import { Branch } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/**
 * Tenant-scoped repository for Branch entities.
 *
 * Branches are subdivisions of an Institute.
 * All queries are automatically scoped to the current tenant.
 */
@Injectable()
export class BranchRepository extends TenantAwareRepository<Branch> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'branch');
  }

  /**
   * Find a branch by ID globally (system-level without tenant scoping).
   * Used strictly for cross-tenant validation checks.
   */
  async findRawById(id: number): Promise<Branch | null> {
    return this.delegate.findUnique({ where: { id } }) as Promise<Branch | null>;
  }
}

