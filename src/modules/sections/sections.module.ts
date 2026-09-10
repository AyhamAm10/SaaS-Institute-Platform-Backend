import { Module } from '@nestjs/common';
import { SectionsController } from './sections.controller';
import { SectionsService } from './sections.service';
import { SectionRepository } from './section.repository';
import { SectionSubjectRepository } from './section-subject.repository';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { BranchesModule } from '../branches/branches.module';
import { AcademicBranchesModule } from '../academic-branches/academic-branches.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { TeachersModule } from '../teachers/teachers.module';

@Module({
  imports: [
    AcademicYearsModule,
    BranchesModule,
    AcademicBranchesModule,
    SubjectsModule,
    TeachersModule,
  ],
  controllers: [SectionsController],
  providers: [SectionsService, SectionRepository, SectionSubjectRepository],
  exports: [SectionsService, SectionRepository, SectionSubjectRepository],
})
export class SectionsModule {}

