import { Module } from '@nestjs/common';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';
import { TeacherRepository } from './teacher.repository';
import { TeacherAssignmentRepository } from './teacher-assignment.repository';
import { TeacherAvailabilityRepository } from './teacher-availability.repository';
import { UsersModule } from '../users/users.module';
import { AcademicBranchesModule } from '../academic-branches/academic-branches.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [
    UsersModule,
    AcademicBranchesModule,
    SubjectsModule,
    BranchesModule,
  ],
  controllers: [TeachersController],
  providers: [
    TeachersService,
    TeacherRepository,
    TeacherAssignmentRepository,
    TeacherAvailabilityRepository,
  ],
  exports: [
    TeachersService,
    TeacherRepository,
    TeacherAssignmentRepository,
    TeacherAvailabilityRepository,
  ],
})
export class TeachersModule {}
