import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { StudentsModule } from '../students/students.module';
import { MobileAccountsController } from './mobile-accounts.controller';
import { MobileAccountsService } from './mobile-accounts.service';
import { MobileAccountsRepository } from './mobile-accounts.repository';

@Module({
  imports: [PrismaModule, AuthModule, FamiliesModule, StudentsModule],
  controllers: [MobileAccountsController],
  providers: [MobileAccountsService, MobileAccountsRepository],
  exports: [MobileAccountsService, MobileAccountsRepository],
})
export class MobileAccountsModule {}
