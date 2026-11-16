import { Inject, Injectable } from '@nestjs/common';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { MobileAccountsRepository } from './mobile-accounts.repository';

export interface ActiveMobileAccount {
  id: number;
  fullName: string;
  phone: string;
  role: string;
}

@Injectable()
export class MobileAccountsService {
  constructor(
    @Inject(MobileAccountsRepository)
    private readonly repository: MobileAccountsRepository,
  ) {}

  /**
   * The live account behind an access token. Tokens are stateless, so a
   * deactivated account is refused here on every mobile request (401).
   */
  async getActiveAccount(userId: number): Promise<ActiveMobileAccount> {
    const user = await this.repository.findActiveAccount(userId);
    Ensure.unauthorized(!user, ErrorMessages.get('mobile_account_inactive'));
    return {
      id: user!.id,
      fullName: user!.fullName,
      phone: user!.phone,
      role: user!.role,
    };
  }

  async getGuardianFamilyIds(userId: number): Promise<number[]> {
    return this.repository.findGuardianFamilyIds(userId);
  }
}
