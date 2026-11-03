import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureKey } from '@prisma/client';
import { FEATURE_KEY } from '../../../common/decorators/require-feature.decorator';
import { Ensure } from '../../../common/errors/ensure';
import { ErrorMessages } from '../../../common/errors/error-messages';
import { InstituteFeaturesService } from '../institute-features.service';

/**
 * Feature-flag guard (global, runs after JwtAuthGuard and RolesGuard).
 * Routes without `@RequireFeature(...)` are not affected.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(InstituteFeaturesService)
    private readonly featuresService: InstituteFeaturesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return true;

    const enabled = await this.featuresService.isEnabled(feature);
    Ensure.forbidden(!enabled, ErrorMessages.get('feature_disabled'));
    return true;
  }
}
