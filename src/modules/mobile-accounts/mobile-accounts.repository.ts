import { Inject, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

const MOBILE_ROLES = ['FAMILY', 'STUDENT'] as const;

/** Reads behind the mobile guards. Management lives in the accounts module. */
@Injectable()
export class MobileAccountsRepository extends TenantAwareRepository<User> {
  protected override readonly softDelete = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'user');
  }

  /** Live (active, not deleted) FAMILY / STUDENT user of this institute. */
  async findActiveAccount(id: number): Promise<User | null> {
    return this.findOne({
      id,
      isActive: true,
      role: { in: [...MOBILE_ROLES] },
    });
  }

  /** Families (not deleted) a guardian account is linked to. */
  async findGuardianFamilyIds(userId: number): Promise<number[]> {
    const rows: { familyId: number }[] = await this.client.familyUser.findMany({
      where: {
        instituteId: this.getInstituteId(),
        userId,
        family: { deletedAt: null },
      },
      select: { familyId: true },
    });
    return rows.map((r) => r.familyId);
  }
}
