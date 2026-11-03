import { jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureKey } from '@prisma/client';
import { FeatureGuard } from './feature.guard';
import { InstituteFeaturesService } from '../institute-features.service';

describe('FeatureGuard', () => {
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  function createGuard(feature: FeatureKey | undefined, enabled: boolean) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(feature),
    } as unknown as Reflector;
    const service = {
      isEnabled: jest.fn(async () => enabled),
    } as unknown as InstituteFeaturesService;
    return { guard: new FeatureGuard(reflector, service), service };
  }

  it('allows routes without @RequireFeature', async () => {
    const { guard, service } = createGuard(undefined, false);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(service.isEnabled).not.toHaveBeenCalled();
  });

  it('allows the route when the feature is enabled', async () => {
    const { guard } = createGuard(FeatureKey.SMS, true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('forbids the route when the feature is disabled', async () => {
    const { guard } = createGuard(FeatureKey.SMS, false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
