import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { BranchRepository } from './branch.repository';

@Module({
  controllers: [BranchesController],
  providers: [BranchesService, BranchRepository],
  exports: [BranchesService, BranchRepository],
})
export class BranchesModule {}
