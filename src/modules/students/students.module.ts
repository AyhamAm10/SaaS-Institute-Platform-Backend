import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentRepository } from './student.repository';
import { StudentEnrollmentRepository } from './student-enrollment.repository';
import { FamiliesModule } from '../families/families.module';
import { StudentFieldsModule } from '../student-fields/student-fields.module';
import { SectionsModule } from '../sections/sections.module';

@Module({
  imports: [FamiliesModule, StudentFieldsModule, SectionsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentRepository, StudentEnrollmentRepository],
  exports: [StudentsService, StudentRepository, StudentEnrollmentRepository],
})
export class StudentsModule {}
