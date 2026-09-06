import { Module } from '@nestjs/common';
import { AcademicYearsController } from './academic-years.controller';
import { AcademicYearsService } from './academic-years.service';
import { AcademicYearRepository } from './academic-year.repository';

@Module({
  controllers: [AcademicYearsController],
  providers: [AcademicYearsService, AcademicYearRepository],
  exports: [AcademicYearsService, AcademicYearRepository],
})
export class AcademicYearsModule {}
