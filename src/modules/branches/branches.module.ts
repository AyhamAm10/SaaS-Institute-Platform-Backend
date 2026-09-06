import { Module } from '@nestjs/common';
import { BranchRepository } from './branch.repository';

@Module({
  providers: [BranchRepository],
  exports: [BranchRepository],
})
export class BranchesModule {}
