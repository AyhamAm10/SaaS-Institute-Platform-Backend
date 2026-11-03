import { Controller, Get, Inject } from '@nestjs/common';
import { InstituteFeaturesService } from './institute-features.service';

/**
 * Feature flags of the caller's institute — lets clients hide disabled modules.
 */
@Controller('features')
export class FeaturesController {
  constructor(
    @Inject(InstituteFeaturesService)
    private readonly featuresService: InstituteFeaturesService,
  ) {}

  @Get()
  async getCurrent() {
    return this.featuresService.getCurrent();
  }
}
