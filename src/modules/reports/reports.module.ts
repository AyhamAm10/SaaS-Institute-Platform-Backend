import { Module } from '@nestjs/common';
import { InstitutesModule } from '../institutes/institutes.module';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { StudentsModule } from '../students/students.module';
import { SectionsModule } from '../sections/sections.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { FeesModule } from '../fees/fees.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { ExamsModule } from '../exams/exams.module';
import { TimetablesModule } from '../timetables/timetables.module';
import { TeachersModule } from '../teachers/teachers.module';
import { StaffModule } from '../staff/staff.module';
import { StudentFieldsModule } from '../student-fields/student-fields.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportVerificationService } from './report-verification.service';
import { ReportExcelService } from './report-excel.service';
import { StudentReports } from './builders/student.reports';
import { FinanceReports } from './builders/finance.reports';
import { AttendanceReports } from './builders/attendance.reports';
import { AcademicReports } from './builders/academic.reports';
import { SheetReports } from './builders/sheets.reports';
import { AdminReports } from './builders/admin.reports';

/**
 * Reports and printing (phase 3 D3). Read-only composition of the domain
 * modules; owns no table.
 */
@Module({
  imports: [
    InstitutesModule,
    AcademicYearsModule,
    StudentsModule,
    SectionsModule,
    EnrollmentsModule,
    FeesModule,
    AttendanceModule,
    ExamsModule,
    TimetablesModule,
    TeachersModule,
    StaffModule,
    StudentFieldsModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportVerificationService,
    ReportExcelService,
    StudentReports,
    FinanceReports,
    AttendanceReports,
    AcademicReports,
    SheetReports,
    AdminReports,
  ],
})
export class ReportsModule {}
