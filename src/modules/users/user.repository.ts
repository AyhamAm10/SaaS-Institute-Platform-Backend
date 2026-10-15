import { Inject, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/**
 * Tenant-scoped user repository.
 *
 * All operations are automatically scoped to the current institute.
 * Used by application services that operate within a tenant context.
 *
 * For cross-tenant operations (e.g., auth login), use UserSystemRepository.
 */
@Injectable()
export class UserRepository extends TenantAwareRepository<User> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'user');
  }

  /** Find a user by phone within the current institute. */
  async findByPhone(phone: string): Promise<User | null> {
    return this.findOne({ phone });
  }

  /** Find a user by ID with their institute data, scoped to current tenant. */
  async findByIdWithInstitute(id: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).user.findFirst({
      where: { id, instituteId: this.getInstituteId() },
      include: { institute: true },
    });
  }
}
