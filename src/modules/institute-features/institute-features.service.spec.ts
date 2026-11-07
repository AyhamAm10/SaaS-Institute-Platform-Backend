import { jest } from '@jest/globals';
import { FeatureKey } from '@prisma/client';
import { InstituteFeaturesService } from './institute-features.service';
import { InstituteFeatureRepository } from './institute-feature.repository';
import { InstituteFeatureSystemRepository } from './institute-feature-system.repository';
import { InstitutesService } from '../institutes/institutes.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { SystemCacheService } from '../../infrastructure/cache/system-cache.service';
import { InMemoryCacheStore } from '../../infrastructure/cache/in-memory-cache.store';
import { RequestContext } from '../../context/request-context';

describe('InstituteFeaturesService', () => {
  const ctx = {
    userId: 1,
    instituteId: 3,
    role: 'INSTITUTE_ADMIN',
    language: 'en',
  };
  let featureRepo: { findMany: jest.Mock };
  let systemRepo: { findByInstitute: jest.Mock; upsert: jest.Mock };
  let service: InstituteFeaturesService;

  beforeEach(() => {
    featureRepo = {
      findMany: jest.fn(async () => [{ key: FeatureKey.SMS, enabled: true }]),
    };
    systemRepo = {
      findByInstitute: jest.fn(async () => []),
      upsert: jest.fn(async () => undefined),
    };
    const store = new InMemoryCacheStore();
    service = new InstituteFeaturesService(
      featureRepo as unknown as InstituteFeatureRepository,
      systemRepo as unknown as InstituteFeatureSystemRepository,
      {
        findById: jest.fn(async () => ({ id: 3 })),
      } as unknown as InstitutesService,
      {
        executeInTransaction: (fn: () => Promise<unknown>) => fn(),
      } as unknown as TransactionHelper,
      new CacheService(store),
      new SystemCacheService(store),
    );
  });

  it('answers feature checks from the cache after the first load', async () => {
    await RequestContext.run(ctx, async () => {
      expect(await service.isEnabled(FeatureKey.SMS)).toBe(true);
      expect(await service.isEnabled(FeatureKey.ACCOUNTING)).toBe(false);
    });

    expect(featureRepo.findMany).toHaveBeenCalledTimes(1);
  });

  it('invalidates the institute cache when a super admin changes its features', async () => {
    await RequestContext.run(ctx, () => service.isEnabled(FeatureKey.SMS));

    await RequestContext.run(
      { ...ctx, instituteId: 1, role: 'SUPER_ADMIN' },
      () =>
        service.setForInstitute(3, {
          features: [{ key: FeatureKey.SMS, enabled: false }],
        }),
    );
    featureRepo.findMany.mockResolvedValue([] as never);

    const enabled = await RequestContext.run(ctx, () =>
      service.isEnabled(FeatureKey.SMS),
    );
    expect(enabled).toBe(false);
    expect(featureRepo.findMany).toHaveBeenCalledTimes(2);
  });
});
