import { Module } from '@nestjs/common';
import { BranchRepository } from './branch.repository';
import { BranchesController } from './branches.controller';

@Module({
  controllers: [BranchesController],
  providers: [BranchRepository],
  exports: [BranchRepository],
})
export class BranchesModule {}

