import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { FamiliesModule } from '../families/families.module';
import { StudentsModule } from '../students/students.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountsRepository } from './accounts.repository';

/** Unified account management: list, reset, activate / deactivate. */
@Module({
  imports: [PrismaModule, AuthModule, UsersModule, FamiliesModule, StudentsModule],
  controllers: [AccountsController],
  providers: [AccountsService, AccountsRepository],
})
export class AccountsModule {}
