import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '@prisma/client';

export const FEATURE_KEY = 'requiredFeature';

/**
 * Restricts a controller or endpoint to institutes that have the given
 * optional module switched on (see InstituteFeature).
 *
 * Usage:
 *   @RequireFeature(FeatureKey.SMS)
 */
export const RequireFeature = (feature: FeatureKey) =>
  SetMetadata(FEATURE_KEY, feature);
