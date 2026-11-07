import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { StaffRepository } from './staff.repository';
import { AuthService } from '../auth/auth.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { RequestContext } from '../../context/request-context';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { UserRole } from '../../common/types/user-role.enum';
import {
  CreateStaffDto,
  ResetStaffPasswordDto,
  StaffMember,
  StaffQueryDto,
  UpdateStaffDto,
} from './dto/staff.dto';

/** bcrypt cost, same as the other account flows. */
const HASH_ROUNDS = 12;

const fail = (key: string): never => {
  throw new BadRequestException(ErrorMessages.get(key));
};

/**
 * Staff accounts (role.md §8.6): admins, registrars and accountants.
 * - You cannot change your own role or deactivate yourself.
 * - At least one active institute admin always remains.
 * - Role change, password reset and deactivation sign the person out
 *   everywhere (refresh tokens revoked); the access token expires on its own.
 */
@Injectable()
export class StaffService {
  constructor(
    @Inject(StaffRepository) private readonly staffRepository: StaffRepository,
    @Inject(AuthService) private readonly authService: AuthService,
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
    const passwordHash = await bcrypt.hash(dto.password, HASH_ROUNDS);

    const id = await this.transactionHelper.executeInTransaction(async () => {
      const user = await this.staffRepository.create({
        fullName: dto.fullName.trim(),
        phone,
        role: dto.role,
        passwordHash,
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

  async resetPassword(id: number, dto: ResetStaffPasswordDto) {
    await this.findOne(id);
    await this.staffRepository.update(id, {
      passwordHash: await bcrypt.hash(dto.password, HASH_ROUNDS),
    });
    await this.authService.logout(id);
    return { updated: true };
  }

  /** Deactivate (soft delete): the account can no longer sign in or refresh. */
  async deactivate(id: number) {
    const member = await this.findOne(id);
    if (id === RequestContext.getUserId()) fail('staff_self_change');
    await this.assertAdminRemains(member);

    await this.transactionHelper.executeInTransaction(async () => {
      await this.staffRepository.syncAdminLink(id, false);
      await this.staffRepository.delete(id);
    });
    await this.authService.logout(id);
    return { deactivated: true };
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
