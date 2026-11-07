import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstitutesModule } from '../institutes/institutes.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StaffRepository } from './staff.repository';
import { StaffActivityService } from './staff-activity.service';
import { AuditLogRepository } from './audit-log.repository';

/** Staff accounts: admins, registrars, accountants (phase 3 D2) + activity (D3). */
@Module({
  imports: [AuthModule, InstitutesModule],
  controllers: [StaffController],
  providers: [
    StaffService,
    StaffRepository,
    StaffActivityService,
    AuditLogRepository,
  ],
  exports: [StaffActivityService],
})
export class StaffModule {}
