import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { ExamsModule } from '../exams/exams.module';
import { FeesModule } from '../fees/fees.module';
import { InstituteProfileModule } from '../institute-profile/institute-profile.module';
import { InstitutesModule } from '../institutes/institutes.module';
import { MobileAccountsModule } from '../mobile-accounts/mobile-accounts.module';
import { StudentsModule } from '../students/students.module';
import { TimetablesModule } from '../timetables/timetables.module';
import { MobileAccessService } from './mobile-access.service';
import { MobileApiController } from './mobile-api.controller';
import { MobileContextService } from './mobile-context.service';
import { MobileOverviewService } from './mobile-overview.service';
import { MobileProfileService } from './mobile-profile.service';
import { MobileStudyService } from './mobile-study.service';

/** Read-only API for guardians (FAMILY) and students (STUDENT) — `/api/mobile/...`. */
@Module({
  imports: [
    AcademicYearsModule,
    AttendanceModule,
    ExamsModule,
    FeesModule,
    InstituteProfileModule,
    InstitutesModule,
    MobileAccountsModule,
    StudentsModule,
    TimetablesModule,
  ],
  controllers: [MobileApiController],
  providers: [
    MobileAccessService,
    MobileContextService,
    MobileOverviewService,
    MobileProfileService,
    MobileStudyService,
  ],
})
export class MobileApiModule {}
