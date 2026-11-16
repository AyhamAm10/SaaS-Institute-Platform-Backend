import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';
import { FamilyRepository } from './family.repository';
import { FamilyUserRepository } from './family-user.repository';
import { FamilyAccountsService } from './family-accounts.service';

@Module({
  imports: [UsersModule],
  controllers: [FamiliesController],
  providers: [
    FamiliesService,
    FamilyRepository,
    FamilyUserRepository,
    FamilyAccountsService,
  ],
  exports: [FamiliesService, FamilyRepository, FamilyAccountsService],
})
export class FamiliesModule {}
