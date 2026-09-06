import { Inject, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { SystemRepository } from '../../database/system.repository';
import { PrismaService } from '../../database/prisma.service';

/**
 * System-level user repository — NO tenant scoping.
 *
 * Used exclusively for operations that legitimately need cross-tenant access:
 *   - Auth login: find user by phone before knowing which institute they belong to
 *   - Token refresh: verify user still exists/is active
 *   - Super-admin user lookups
 *
 * Normal application code should use UserRepository (tenant-scoped) instead.
 */
@Injectable()
export class UserSystemRepository extends SystemRepository<User> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'user');
  }

  /** Find a user by phone across all institutes. Used for login. */
  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  /** Find a user by ID with their institute data. Used for profile/token refresh. */
  async findByIdWithInstitute(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { institute: true },
    });
  }
}
