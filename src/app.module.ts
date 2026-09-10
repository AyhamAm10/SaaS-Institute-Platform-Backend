import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { RequestContextModule } from './context/request-context.module';
import { AuthModule } from './modules/auth/auth.module';
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

    // Domain modules
    AuthModule,
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
  ],
})
export class AppModule {}

