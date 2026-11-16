import { Inject, Injectable } from '@nestjs/common';
import { Family, FamilyUser, GuardianRelationship } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/** Links between a family and the guardian accounts that sign in for it. */
@Injectable()
export class FamilyUserRepository extends TenantAwareRepository<FamilyUser> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'familyUser');
  }

  async findLink(familyId: number, userId: number): Promise<FamilyUser | null> {
    return this.findOne({ familyId, userId });
  }

  async link(
    familyId: number,
    userId: number,
    relationship: GuardianRelationship,
  ): Promise<void> {
    await this.create({ familyId, userId, relationship });
  }

  /** Removes the links of this family to guardians whose phone is `phone`. */
  async unlinkByPhone(familyId: number, phone: string): Promise<void> {
    await this.client.familyUser.deleteMany({
      where: {
        instituteId: this.getInstituteId(),
        familyId,
        user: { phone },
      },
    });
  }

  /** Families (not deleted) with a phone and no guardian account linked. */
  async findFamiliesWithoutGuardian(): Promise<Family[]> {
    return this.client.family.findMany({
      where: {
        instituteId: this.getInstituteId(),
        deletedAt: null,
        phone: { not: null },
        familyUsers: { none: {} },
      },
      orderBy: { id: 'asc' },
    });
  }

  /** Families (not deleted) that have no phone, so no account can exist. */
  async countFamiliesWithoutPhone(): Promise<number> {
    return this.client.family.count({
      where: {
        instituteId: this.getInstituteId(),
        deletedAt: null,
        OR: [{ phone: null }, { phone: '' }],
      },
    });
  }
}
