import { Module } from '@nestjs/common';
import { InstitutesController } from './institutes.controller';
import { InstitutesService } from './institutes.service';
import { InstituteRepository } from './institute.repository';
import { InstituteClockService } from './institute-clock.service';
import { UsersModule } from '../users/users.module';
import { AcademicBranchesModule } from '../academic-branches/academic-branches.module';

@Module({
  imports: [UsersModule, AcademicBranchesModule],
  controllers: [InstitutesController],
  providers: [InstitutesService, InstituteRepository, InstituteClockService],
  exports: [InstitutesService, InstituteRepository, InstituteClockService],
})
export class InstitutesModule {}
