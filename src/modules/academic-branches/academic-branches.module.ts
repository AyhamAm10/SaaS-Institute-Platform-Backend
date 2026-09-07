import { Module } from '@nestjs/common';
import { AcademicBranchesController } from './academic-branches.controller';
import { AcademicBranchesService } from './academic-branches.service';
import { AcademicBranchRepository } from './academic-branch.repository';

@Module({
  controllers: [AcademicBranchesController],
  providers: [AcademicBranchesService, AcademicBranchRepository],
  exports: [AcademicBranchesService, AcademicBranchRepository],
})
export class AcademicBranchesModule {}
