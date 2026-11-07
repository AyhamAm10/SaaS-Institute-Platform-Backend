import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { RequestContextModule } from './context/request-context.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { CacheModule } from './infrastructure/cache/cache.module';
import { HealthModule } from './infrastructure/health/health.module';
import { RateLimitModule } from './infrastructure/rate-limit/rate-limit.module';
import { LockModule } from './infrastructure/lock/lock.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { OperationalContextModule } from './modules/operational-context/operational-context.module';
import { UsersModule } from './modules/users/users.module';
import { InstitutesModule } from './modules/institutes/institutes.module';
import { BranchesModule } from './modules/branches/branches.module';
import { AcademicYearsModule } from './modules/academic-years/academic-years.module';
import { AcademicBranchesModule } from './modules/academic-branches/academic-branches.module';
import { SectionsModule } from './modules/sections/sections.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { InstituteScheduleConfigModule } from './modules/institute-schedule-config/institute-schedule-config.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { TimetablesModule } from './modules/timetables/timetables.module';
import { FamiliesModule } from './modules/families/families.module';
import { StudentFieldsModule } from './modules/student-fields/student-fields.module';
import { StudentsModule } from './modules/students/students.module';
import { InstituteFeaturesModule } from './modules/institute-features/institute-features.module';
import { StorageModule } from './modules/storage/storage.module';
import { ReferenceDataModule } from './modules/reference-data/reference-data.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { FeesModule } from './modules/fees/fees.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ExamsModule } from './modules/exams/exams.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { StaffModule } from './modules/staff/staff.module';
import { ReportsModule } from './modules/reports/reports.module';
import { JobsModule } from './modules/jobs/jobs.module';

@Module({
  imports: [
    // Global config — loads .env automatically
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Infrastructure
    PrismaModule,
    RequestContextModule,
    RedisModule,
    CacheModule,
    LockModule,
    QueueModule,
    HealthModule,
    // Before AuthModule: its global guard must throttle before authentication
    RateLimitModule,

    // Domain modules
    AuthModule,
    // After AuthModule: validates the branch / year headers of authenticated requests
    OperationalContextModule,
    UsersModule,
    InstitutesModule,
    BranchesModule,
    AcademicYearsModule,
    AcademicBranchesModule,
    SectionsModule,
    SubjectsModule,
    InstituteScheduleConfigModule,
    TeachersModule,
    RoomsModule,
    TimetablesModule,
    FamiliesModule,
    StudentFieldsModule,
    StudentsModule,
    InstituteFeaturesModule,
    StorageModule,
    ReferenceDataModule,
    EnrollmentsModule,
    FeesModule,
    AttendanceModule,
    ExamsModule,
    DashboardModule,
    StaffModule,
    ReportsModule,
    JobsModule,
  ],
})
export class AppModule {}
