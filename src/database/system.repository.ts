import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

/**
 * System-level repository with NO automatic tenant scoping.
 *
 * Use this ONLY for operations that legitimately need cross-tenant access:
 *   - Auth login (find user by phone across all institutes)
 *   - Super-admin operations
 *   - System-level migrations/maintenance
 *
 * Normal application code should NEVER use SystemRepository.
 * The explicit choice of SystemRepository over TenantAwareRepository
 * makes cross-tenant access auditable and intentional.
 */
export abstract class SystemRepository<T> extends BaseRepository<T> {
  constructor(prisma: PrismaService, modelName: string) {
    super(prisma, modelName);
  }

  // No overrides — inherits all BaseRepository methods without tenant scoping.
  // This is intentional: SystemRepository is the "escape hatch" for legitimate
  // cross-tenant operations.
}
