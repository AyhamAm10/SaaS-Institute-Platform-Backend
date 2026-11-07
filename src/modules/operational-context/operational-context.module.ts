import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BranchesModule } from '../branches/branches.module';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { OperationalContextGuard } from './operational-context.guard';

/**
 * Validates the operational context headers of every authenticated request.
 * Imported right after AuthModule so its global guard runs after the JWT
 * guard has filled the request context (APP_GUARD order = module order).
 */
@Module({
  imports: [BranchesModule, AcademicYearsModule],
  providers: [{ provide: APP_GUARD, useClass: OperationalContextGuard }],
})
export class OperationalContextModule {}
