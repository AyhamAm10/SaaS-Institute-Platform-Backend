import { Module } from '@nestjs/common';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';
import { FamilyRepository } from './family.repository';

@Module({
  controllers: [FamiliesController],
  providers: [FamiliesService, FamilyRepository],
  exports: [FamiliesService, FamilyRepository],
})
export class FamiliesModule {}
