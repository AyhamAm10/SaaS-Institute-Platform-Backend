import { Module } from '@nestjs/common';
import { SectionsController } from './sections.controller';
import { SectionsService } from './sections.service';
import { SectionRepository } from './section.repository';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [AcademicYearsModule, BranchesModule],
  controllers: [SectionsController],
  providers: [SectionsService, SectionRepository],
  exports: [SectionsService, SectionRepository],
})
export class SectionsModule {}
