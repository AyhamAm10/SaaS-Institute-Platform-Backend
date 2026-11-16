import { Module } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserSystemRepository } from './user-system.repository';
import { SuperAdminInitService } from './super-admin-init.service';
import { AccountProvisioningService } from './account-provisioning.service';

@Module({
  providers: [
    UserRepository,
    UserSystemRepository,
    SuperAdminInitService,
    AccountProvisioningService,
  ],
  exports: [
    UserRepository,
    UserSystemRepository,
    SuperAdminInitService,
    AccountProvisioningService,
  ],
})
export class UsersModule {}
