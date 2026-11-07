import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentRepository } from './student.repository';
import { StudentEnrollmentRepository } from './student-enrollment.repository';
import { FamiliesModule } from '../families/families.module';
import { StudentFieldsModule } from '../student-fields/student-fields.module';
import { SectionsModule } from '../sections/sections.module';
import { BranchesModule } from '../branches/branches.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { StudentReferencesResolver } from './student-references.resolver';

@Module({
  imports: [
    FamiliesModule,
    StudentFieldsModule,
    SectionsModule,
    BranchesModule,
    ReferenceDataModule,
  ],
  controllers: [StudentsController],
  providers: [
    StudentsService,
    StudentRepository,
    StudentEnrollmentRepository,
    StudentReferencesResolver,
  ],
  exports: [StudentsService, StudentRepository, StudentEnrollmentRepository],
})
export class StudentsModule {}
