import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { UserSystemRepository } from './user-system.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { UserRole } from '../../common/types/user-role.enum';

/**
 * Service responsible for ensuring the Super Admin user exists upon system startup.
 *
 * Requirements:
 *  - Checks whether a user with role SUPER_ADMIN matching the phone from .env (SUPER_ADMIN_NUMBER) exists.
 *  - If it exists, returns immediately (no-op).
 *  - If it does not exist, provisions the Super Admin user with password from .env (SUPER_ADMIN_PASSWORD).
 *  - If no institute exists in the database, provisions a default root platform institute to satisfy the foreign key constraint.
 *  - Executes multi-step creation within an interactive transaction via TransactionHelper.
 */
@Injectable()
export class SuperAdminInitService {
  private readonly logger = new Logger(SuperAdminInitService.name);

  constructor(
    @Inject(UserSystemRepository)
    private readonly userSystemRepository: UserSystemRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  /**
   * Initializes the Super Admin account if not already present.
   */
  async initSuperAdmin(): Promise<void> {
    const phone = this.configService
      .getOrThrow<string>('SUPER_ADMIN_NUMBER')
      .trim();
    const rawPassword = this.configService
      .getOrThrow<string>('SUPER_ADMIN_PASSWORD')
      .trim();

    this.logger.log(`Checking Super Admin user for phone: ${phone}...`);

    // 1. Check if Super Admin with this phone number already exists
    const existingSuperAdmin =
      await this.userSystemRepository.findSuperAdminByPhone(phone);
    if (existingSuperAdmin) {
      this.logger.log(
        `Super Admin user already exists with phone: ${phone}. No initialization needed.`,
      );
      return;
    }

    // 2. Check if a user with this phone exists under another role
    const existingUser = await this.userSystemRepository.findByPhone(phone);
    if (existingUser) {
      this.logger.warn(
        `User with phone ${phone} found with role '${existingUser.role}'. Promoting to ${UserRole.SUPER_ADMIN}.`,
      );
      await this.userSystemRepository.update(existingUser.id, {
        role: UserRole.SUPER_ADMIN,
      });
      this.logger.log(
        `User with phone ${phone} promoted to ${UserRole.SUPER_ADMIN}.`,
      );
      return;
    }

    // 3. Hash password using bcryptjs with 12 salt rounds (per role.md rule 8.2)
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    // 4. Atomically create root institute (if none exists) and Super Admin user
    await this.transactionHelper.executeInTransaction(async () => {
      let instituteId = await this.userSystemRepository.findAnyInstituteId();
      if (!instituteId) {
        this.logger.log(
          'No institute found in database. Provisioning default platform root institute...',
        );
        instituteId =
          await this.userSystemRepository.createPlatformInstitute(phone);
        this.logger.log(
          `Default platform root institute created with ID: ${instituteId}`,
        );
      }

      const fullName =
        this.configService.get<string>('SUPER_ADMIN_NAME')?.trim() ||
        'Super Administrator';

      await this.userSystemRepository.createSuperAdmin({
        fullName,
        phone,
        passwordHash,
        instituteId,
      });
    });

    this.logger.log(
      `Super Admin user successfully created with phone: ${phone} and role: ${UserRole.SUPER_ADMIN}.`,
    );
  }
}
