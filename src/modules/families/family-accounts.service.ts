import { Inject, Injectable } from '@nestjs/common';
import { Family, GuardianRelationship } from '@prisma/client';
import { UserRepository } from '../users/user.repository';
import { AccountProvisioningService } from '../users/account-provisioning.service';
import { UserRole } from '../../common/types/user-role.enum';
import { FamilyUserRepository } from './family-user.repository';

/** What happened to the guardian account of a family. */
export type FamilyAccountStatus =
  | 'CREATED'
  | 'LINKED'
  | 'EXISTS'
  | 'NO_PHONE'
  | 'PHONE_TAKEN';

type FamilyNames = Pick<
  Family,
  'id' | 'familyName' | 'fatherName' | 'motherName' | 'phone'
>;

/**
 * Every family with a phone has a guardian login: the phone is the username
 * and the password is the default one (changed at the first sign-in). Called
 * whenever a family is created or its phone changes, and for the back-fill of
 * older families. A phone that already belongs to a staff member or teacher is
 * never touched: the family is reported as `PHONE_TAKEN`.
 */
@Injectable()
export class FamilyAccountsService {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(AccountProvisioningService)
    private readonly provisioning: AccountProvisioningService,
    @Inject(FamilyUserRepository)
    private readonly links: FamilyUserRepository,
  ) {}

  async ensureAccount(family: FamilyNames): Promise<FamilyAccountStatus> {
    const phone = family.phone?.trim();
    if (!phone) return 'NO_PHONE';

    const existing = await this.users.findByPhone(phone);
    if (existing) {
      if (existing.role !== UserRole.FAMILY) return 'PHONE_TAKEN';
      if (await this.links.findLink(family.id, existing.id)) return 'EXISTS';
      await this.links.link(family.id, existing.id, relationshipOf(family));
      return 'LINKED';
    }

    const user = await this.provisioning.provision({
      fullName: guardianName(family),
      phone,
      role: UserRole.FAMILY,
    });
    await this.links.link(family.id, user.id, relationshipOf(family));
    return 'CREATED';
  }

  /** The family phone changed: the old guardian link goes, the new one is made. */
  async rePoint(
    family: FamilyNames,
    previousPhone: string | null,
  ): Promise<FamilyAccountStatus> {
    const old = previousPhone?.trim();
    if (old && old !== family.phone?.trim()) {
      await this.links.unlinkByPhone(family.id, old);
    }
    return this.ensureAccount(family);
  }

  /** Back-fill: accounts for every family that has a phone and no guardian yet. */
  async syncAll(): Promise<{
    created: number;
    linked: number;
    phoneTaken: number;
    withoutPhone: number;
  }> {
    const result = { created: 0, linked: 0, phoneTaken: 0, withoutPhone: 0 };
    for (const family of await this.links.findFamiliesWithoutGuardian()) {
      const status = await this.ensureAccount(family);
      if (status === 'CREATED') result.created += 1;
      else if (status === 'LINKED') result.linked += 1;
      else if (status === 'PHONE_TAKEN') result.phoneTaken += 1;
    }
    result.withoutPhone = await this.links.countFamiliesWithoutPhone();
    return result;
  }

  /** Families with no guardian account, for the accounts screen banner. */
  async countMissing(): Promise<{ withPhone: number; withoutPhone: number }> {
    return {
      withPhone: (await this.links.findFamiliesWithoutGuardian()).length,
      withoutPhone: await this.links.countFamiliesWithoutPhone(),
    };
  }
}

function guardianName(f: FamilyNames): string {
  return (
    f.fatherName?.trim() || f.motherName?.trim() || `عائلة ${f.familyName}`
  );
}

function relationshipOf(f: FamilyNames): GuardianRelationship {
  if (f.fatherName?.trim()) return GuardianRelationship.FATHER;
  if (f.motherName?.trim()) return GuardianRelationship.MOTHER;
  return GuardianRelationship.GUARDIAN;
}
