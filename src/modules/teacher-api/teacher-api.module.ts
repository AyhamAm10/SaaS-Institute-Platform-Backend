import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { ExamsModule } from '../exams/exams.module';
import { InstituteScheduleConfigModule } from '../institute-schedule-config/institute-schedule-config.module';
import { InstitutesModule } from '../institutes/institutes.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { SectionsModule } from '../sections/sections.module';
import { TeachersModule } from '../teachers/teachers.module';
import { TimetablesModule } from '../timetables/timetables.module';
import { TeacherAccessService } from './teacher-access.service';
import { TeacherApiController } from './teacher-api.controller';
import { TeacherContextService } from './teacher-context.service';
import { TeacherOverviewService } from './teacher-overview.service';
import { TeacherProfileService } from './teacher-profile.service';
import { TeacherStudyService } from './teacher-study.service';

/** Read-only API of the teacher app (`/api/teacher/*`). */
@Module({
  imports: [
    AcademicYearsModule,
    EnrollmentsModule,
    ExamsModule,
    InstituteScheduleConfigModule,
    InstitutesModule,
    ReferenceDataModule,
    SectionsModule,
    TeachersModule,
    TimetablesModule,
  ],
  controllers: [TeacherApiController],
  providers: [
    TeacherAccessService,
    TeacherContextService,
    TeacherProfileService,
    TeacherStudyService,
    TeacherOverviewService,
  ],
})
export class TeacherApiModule {}
