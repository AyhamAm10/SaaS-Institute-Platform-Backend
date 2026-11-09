import { Inject, Injectable } from '@nestjs/common';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { UserRole } from '../../common/types/user-role.enum';
import { FeesReportsService } from '../fees/fees-reports.service';
import { InstituteProfileService } from '../institute-profile/institute-profile.service';
import { MobileAccessService } from './mobile-access.service';
import { MobileContextService } from './mobile-context.service';
import { isoDate, nullIfBlank, sectionOf, toChild, toMobileFinance } from './mobile-mappers';
import { MobileFinance, MobileMe, MobileProfile } from './mobile-api.types';

/** Who am I, a child's profile and (guardians only) a child's finances. */
@Injectable()
export class MobileProfileService {
  constructor(
    @Inject(MobileAccessService) private readonly access: MobileAccessService,
    @Inject(MobileContextService) private readonly context: MobileContextService,
    @Inject(InstituteProfileService)
    private readonly institute: InstituteProfileService,
    @Inject(FeesReportsService) private readonly fees: FeesReportsService,
  ) {}

  async getMe(): Promise<MobileMe> {
    const caller = await this.access.caller();
    const [institute, children] = await Promise.all([
      this.institute.getProfile(),
      this.access.children(caller),
    ]);
    return {
      role: caller.role,
      userId: caller.userId,
      phone: caller.phone,
      displayName: caller.fullName,
      institute: {
        id: institute.id,
        name: institute.name,
        logoUrl: nullIfBlank(institute.logoUrl),
        primaryColor: nullIfBlank(institute.primaryColor),
        secondaryColor: nullIfBlank(institute.secondaryColor),
        phone: nullIfBlank(institute.phone),
        address: nullIfBlank(institute.address),
      },
      children: children.map(toChild),
    };
  }

  async getProfile(studentId: number): Promise<MobileProfile> {
    const caller = await this.access.caller();
    const [child, institute] = await Promise.all([
      this.access.child(caller, studentId),
      this.institute.getProfile(),
    ]);
    return {
      fullName: child.fullName,
      gender: child.gender,
      birthDate: child.birthDate ? isoDate(child.birthDate) : null,
      section: sectionOf(child),
      branch: { id: child.branch.id, name: child.branch.name },
      statusName: child.status?.name ?? null,
      bus: child.bus
        ? {
            name: child.bus.name,
            driverName: nullIfBlank(child.bus.driverName),
            driverPhone: nullIfBlank(child.bus.driverPhone),
          }
        : null,
      family:
        caller.role === UserRole.FAMILY
          ? {
              familyName: child.family.familyName,
              phone: nullIfBlank(child.family.phone),
            }
          : null,
      institute: {
        name: institute.name,
        phone: nullIfBlank(institute.phone),
        address: nullIfBlank(institute.address),
      },
    };
  }

  /** Guardians only: a student account is refused before any lookup. */
  async getFinance(studentId: number): Promise<MobileFinance> {
    const caller = await this.access.caller();
    Ensure.forbidden(
      caller.role !== UserRole.FAMILY,
      ErrorMessages.get('mobile_finance_family_only'),
    );
    const child = await this.access.child(caller, studentId);
    return this.context.runFor(child, async () =>
      toMobileFinance(await this.fees.getStudentFinance(child.id)),
    );
  }
}
