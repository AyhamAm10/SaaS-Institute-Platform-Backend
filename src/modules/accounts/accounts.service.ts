import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { RequestContext } from '../../context/request-context';
import { UserRole } from '../../common/types/user-role.enum';
import { TransactionHelper } from '../../database/transaction.helper';
import { AuthService } from '../auth/auth.service';
import { UserRepository } from '../users/user.repository';
import { AccountProvisioningService } from '../users/account-provisioning.service';
import { FamilyAccountsService } from '../families/family-accounts.service';
import { StudentRepository } from '../students/student.repository';
import { AccountsRepository } from './accounts.repository';
import {
  AccountItem,
  AccountsQueryDto,
  CreateStudentAccountDto,
} from './dto/accounts.dto';

/**
 * The accounts screen: one place to see, reset and switch off the logins of
 * staff, teachers, families and students.
 * - Reset puts the default password back (the next sign-in forces a change).
 * - Deactivate keeps the row and its phone (reversible) and ends the sessions.
 * - You cannot reset or deactivate yourself, nor the last active admin.
 */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(AccountsRepository) private readonly repository: AccountsRepository,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(AccountProvisioningService)
    private readonly provisioning: AccountProvisioningService,
    @Inject(FamilyAccountsService)
    private readonly familyAccounts: FamilyAccountsService,
    @Inject(StudentRepository)
    private readonly studentRepository: StudentRepository,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  async findAll(query: AccountsQueryDto) {
    return this.repository.list(query);
  }

  /** Families that still have no guardian account (banner of the families tab). */
  async summary() {
    return { missingFamilies: await this.familyAccounts.countMissing() };
  }

  /**
   * Creates the accounts of every family that has a phone and none yet. Not one
   * big transaction: each family is independent and a rerun finishes the rest
   * (an account without its link is linked on the next run).
   */
  async syncFamilies() {
    return this.familyAccounts.syncAll();
  }

  async resetPassword(id: number): Promise<{ updated: boolean }> {
    const user = await this.findManaged(id);
    this.assertNotSelf(id);
    await this.provisioning.resetToDefault(user.id);
    await this.authService.logout(user.id);
    return { updated: true };
  }

  async setActive(id: number, isActive: boolean): Promise<AccountItem> {
    const user = await this.findManaged(id);
    if (!isActive) {
      this.assertNotSelf(id);
      await this.assertAdminRemains(user.role);
    }
    await this.transactionHelper.executeInTransaction(() =>
      this.repository.setActive(user, isActive),
    );
    if (!isActive) await this.authService.logout(user.id);
    return this.findItem(id);
  }

  async findEligibleStudents(search?: string) {
    return this.repository.findStudentsWithoutAccount(search);
  }

  async createStudentAccount(dto: CreateStudentAccountDto): Promise<AccountItem> {
    const student = await this.studentRepository.findStudentById(dto.studentId);
    Ensure.exists(student, 'Student');
    if (student.userId) {
      throw new BadRequestException(
        ErrorMessages.get('student_already_has_account'),
      );
    }
    const phone = dto.phone.trim();
    if (await this.users.findByPhone(phone)) {
      throw new ConflictException(
        ErrorMessages.get('mobile_account_phone_duplicate'),
      );
    }
    const id = await this.transactionHelper.executeInTransaction(async () => {
      const user = await this.provisioning.provision({
        fullName: student.fullName,
        phone,
        role: UserRole.STUDENT,
      });
      await this.repository.linkStudent(student.id, user.id);
      return user.id;
    });
    return this.findItem(id);
  }

  // ── helpers ────────────────────────────────────────────────────────────

  /** An account of this institute that the screen may manage (never a super admin). */
  private async findManaged(id: number) {
    const user = await this.repository.findAccount(id);
    Ensure.exists(user, 'User');
    Ensure.custom(
      user.role === UserRole.SUPER_ADMIN,
      ErrorMessages.get('account_wrong_type'),
      403,
    );
    return user;
  }

  private async findItem(id: number): Promise<AccountItem> {
    const item = await this.repository.findItem(id);
    Ensure.exists(item, 'User');
    return item;
  }

  private assertNotSelf(id: number): void {
    Ensure.custom(
      id === RequestContext.getUserId(),
      ErrorMessages.get('account_self_change'),
      400,
    );
  }

  private async assertAdminRemains(role: string): Promise<void> {
    if (role !== UserRole.INSTITUTE_ADMIN) return;
    Ensure.custom(
      (await this.repository.countActiveAdmins()) <= 1,
      ErrorMessages.get('staff_last_admin'),
      400,
    );
  }
}
