import { Module } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserSystemRepository } from './user-system.repository';

@Module({
  providers: [UserRepository, UserSystemRepository],
  exports: [UserRepository, UserSystemRepository],
})
export class UsersModule {}
