import { Module } from '@nestjs/common';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentSubjectRepository } from './enrollment-subject.repository';
import { StudentsModule } from '../students/students.module';
import { SectionsModule } from '../sections/sections.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';

@Module({
  imports: [StudentsModule, SectionsModule, ReferenceDataModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, EnrollmentSubjectRepository],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
