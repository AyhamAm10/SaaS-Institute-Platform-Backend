import { FeatureKey } from '@prisma/client';

/** Every known feature with its state (missing rows are reported as disabled). */
export interface FeatureStatus {
  key: FeatureKey;
  enabled: boolean;
}
