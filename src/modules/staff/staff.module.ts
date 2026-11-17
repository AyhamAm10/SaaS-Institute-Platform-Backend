import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstitutesModule } from '../institutes/institutes.module';
import { UsersModule } from '../users/users.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StaffRepository } from './staff.repository';
import { StaffActivityService } from './staff-activity.service';
import { AuditLogRepository } from './audit-log.repository';
import { AuditController } from './audit.controller';
import { AuditViewService } from './audit-view.service';

/** Staff accounts: admins, registrars, accountants (phase 3 D2) + activity (D3). */
@Module({
  imports: [AuthModule, InstitutesModule, UsersModule],
  controllers: [StaffController, AuditController],
  providers: [
    StaffService,
    StaffRepository,
    StaffActivityService,
    AuditViewService,
    AuditLogRepository,
  ],
  exports: [StaffActivityService],
})
export class StaffModule {}
