import { Module } from '@nestjs/common';
import { InstitutesModule } from '../institutes/institutes.module';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { SectionsModule } from '../sections/sections.module';
import { TeachersModule } from '../teachers/teachers.module';
import { StudentsModule } from '../students/students.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { FeesModule } from '../fees/fees.module';
import { ExamsModule } from '../exams/exams.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** Dashboard home: composes the overview of every domain (read-only). */
@Module({
  imports: [
    InstitutesModule,
    AcademicYearsModule,
    SectionsModule,
    TeachersModule,
    StudentsModule,
    EnrollmentsModule,
    AttendanceModule,
    FeesModule,
    ExamsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
