import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { MobileAccountsService } from './mobile-accounts.service';
import { MobileAccountsRepository } from './mobile-accounts.repository';

/** Live-account checks behind the mobile API. Account management: `accounts`. */
@Module({
  imports: [PrismaModule],
  providers: [MobileAccountsService, MobileAccountsRepository],
  exports: [MobileAccountsService, MobileAccountsRepository],
})
export class MobileAccountsModule {}
