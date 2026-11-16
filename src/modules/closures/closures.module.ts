import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { SectionsModule } from '../sections/sections.module';
import { ClosuresController } from './closures.controller';
import { ClosuresService } from './closures.service';
import { ClosureRepository } from './closure.repository';

/** Closures / holidays (عطل): institute, branch or section level. */
@Module({
  imports: [BranchesModule, SectionsModule],
  controllers: [ClosuresController],
  providers: [ClosuresService, ClosureRepository],
  exports: [ClosuresService],
})
export class ClosuresModule {}
