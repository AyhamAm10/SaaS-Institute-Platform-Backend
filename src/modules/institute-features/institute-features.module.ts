import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InstitutesModule } from '../institutes/institutes.module';
import { FeaturesController } from './features.controller';
import { InstituteFeaturesController } from './institute-features.controller';
import { InstituteFeaturesService } from './institute-features.service';
import { InstituteFeatureRepository } from './institute-feature.repository';
import { InstituteFeatureSystemRepository } from './institute-feature-system.repository';
import { FeatureGuard } from './guards/feature.guard';

@Module({
  imports: [InstitutesModule],
  controllers: [FeaturesController, InstituteFeaturesController],
  providers: [
    InstituteFeaturesService,
    InstituteFeatureRepository,
    InstituteFeatureSystemRepository,
    // Registered after AuthModule's guards → runs after JWT + roles checks
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
  exports: [InstituteFeaturesService],
})
export class InstituteFeaturesModule {}
