import { Inject, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { UserRepository } from './user.repository';
import {
  DEFAULT_ACCOUNT_PASSWORD,
  PASSWORD_HASH_ROUNDS,
} from './default-password';

/**
 * The only place that creates a login account. The phone is the username, the
 * password is the default one and the first sign-in forces a change. Callers
 * (staff, teachers, families, students) never choose a password.
 */
@Injectable()
export class AccountProvisioningService {
  /** One hash of the default password per process: bcrypt is slow and every default account shares it. */
  private defaultHash: Promise<string> | null = null;

  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  /** Creates the account inside the caller's transaction (phone must be free). */
  async provision(data: {
    fullName: string;
    phone: string;
    role: string;
  }): Promise<User> {
    return this.users.createAccount({
      fullName: data.fullName,
      phone: data.phone,
      role: data.role,
      passwordHash: await this.hashedDefault(),
    });
  }

  /** Back to the default password; the next sign-in forces a change. */
  async resetToDefault(userId: number): Promise<void> {
    await this.users.update(userId, {
      passwordHash: await this.hashedDefault(),
      mustChangePassword: true,
    });
  }

  private hashedDefault(): Promise<string> {
    this.defaultHash ??= bcrypt.hash(
      DEFAULT_ACCOUNT_PASSWORD,
      PASSWORD_HASH_ROUNDS,
    );
    return this.defaultHash;
  }
}
