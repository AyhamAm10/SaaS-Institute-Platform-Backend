import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { StaffRepository } from './staff.repository';
import { AuthService } from '../auth/auth.service';
import { AccountProvisioningService } from '../users/account-provisioning.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { RequestContext } from '../../context/request-context';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { UserRole } from '../../common/types/user-role.enum';
import {
  CreateStaffDto,
  StaffMember,
  StaffQueryDto,
  UpdateStaffDto,
} from './dto/staff.dto';

const fail = (key: string): never => {
  throw new BadRequestException(ErrorMessages.get(key));
};

/**
 * Staff accounts (role.md §8.6): admins, registrars and accountants.
 * - You cannot change your own role or deactivate yourself.
 * - At least one active institute admin always remains.
 * - A new account gets the default password and must change it at first
 *   sign-in. Password reset and activate / deactivate live in the accounts
 *   screen (`/accounts`); a role change signs the person out everywhere.
 */
@Injectable()
export class StaffService {
  constructor(
    @Inject(StaffRepository) private readonly staffRepository: StaffRepository,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AccountProvisioningService)
    private readonly provisioning: AccountProvisioningService,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  async findAll(query: StaffQueryDto) {
    return this.staffRepository.findStaff(query);
  }

  async create(dto: CreateStaffDto): Promise<StaffMember> {
    const phone = dto.phone.trim();
    if (await this.staffRepository.findByPhone(phone)) {
      throw new ConflictException(ErrorMessages.get('staff_phone_duplicate'));
    }
    const id = await this.transactionHelper.executeInTransaction(async () => {
      const user = await this.provisioning.provision({
        fullName: dto.fullName.trim(),
        phone,
        role: dto.role,
      });
      await this.staffRepository.syncAdminLink(
        user.id,
        dto.role === UserRole.INSTITUTE_ADMIN,
      );
      return user.id;
    });
    return this.findOne(id);
  }

  async update(id: number, dto: UpdateStaffDto): Promise<StaffMember> {
    const member = await this.findOne(id);
    const roleChanges = dto.role !== undefined && dto.role !== member.role;
    if (roleChanges) {
      if (id === RequestContext.getUserId()) fail('staff_self_change');
      await this.assertAdminRemains(member);
    }

    await this.transactionHelper.executeInTransaction(async () => {
      await this.staffRepository.update(id, {
        ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
        ...(roleChanges && { role: dto.role }),
      });
      if (roleChanges) {
        await this.staffRepository.syncAdminLink(
          id,
          dto.role === UserRole.INSTITUTE_ADMIN,
        );
      }
    });
    // A new role is picked up on the next sign-in
    if (roleChanges) await this.authService.logout(id);
    return this.findOne(id);
  }

  private async findOne(id: number): Promise<StaffMember> {
    const member = await this.staffRepository.findStaffById(id);
    Ensure.exists(member, 'Staff');
    return member;
  }

  /** Removing / demoting an admin is refused when it is the last active one. */
  private async assertAdminRemains(member: StaffMember): Promise<void> {
    if (member.role !== UserRole.INSTITUTE_ADMIN) return;
    if ((await this.staffRepository.countActiveAdmins()) <= 1) {
      fail('staff_last_admin');
    }
  }
}
