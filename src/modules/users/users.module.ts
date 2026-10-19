import { Module } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserSystemRepository } from './user-system.repository';
import { SuperAdminInitService } from './super-admin-init.service';

@Module({
  providers: [UserRepository, UserSystemRepository, SuperAdminInitService],
  exports: [UserRepository, UserSystemRepository, SuperAdminInitService],
})
export class UsersModule {}
