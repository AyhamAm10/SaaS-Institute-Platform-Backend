import { Module } from '@nestjs/common';
import { SectionsModule } from '../sections/sections.module';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { ExamRepository, ExamResultRepository } from './exam.repository';

/** Exams and marks (E9). */
@Module({
  imports: [
    SectionsModule,
    AcademicYearsModule,
    ReferenceDataModule,
    EnrollmentsModule,
  ],
  controllers: [ExamsController],
  providers: [ExamsService, ExamRepository, ExamResultRepository],
  exports: [ExamsService],
})
export class ExamsModule {}
