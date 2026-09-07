import { Module } from '@nestjs/common';
import { InstitutesController } from './institutes.controller';
import { InstitutesService } from './institutes.service';
import { InstituteRepository } from './institute.repository';
import { UsersModule } from '../users/users.module';
import { AcademicBranchesModule } from '../academic-branches/academic-branches.module';

@Module({
  imports: [UsersModule, AcademicBranchesModule],
  controllers: [InstitutesController],
  providers: [InstitutesService, InstituteRepository],
  exports: [InstitutesService, InstituteRepository],
})
export class InstitutesModule {}
