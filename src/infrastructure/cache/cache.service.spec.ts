import { jest } from '@jest/globals';
import { CacheService } from './cache.service';
import { SystemCacheService } from './system-cache.service';
import { InMemoryCacheStore } from './in-memory-cache.store';
import { CacheStore } from './cache-store';
import { CacheKeys } from './cache-keys';
import { RequestContext } from '../../context/request-context';

const ctx = (instituteId: number) => ({
  userId: 1,
  instituteId,
  role: 'INSTITUTE_ADMIN',
  language: 'en',
});

describe('CacheService (tenant-aware)', () => {
  let store: InMemoryCacheStore;
  let cache: CacheService;
  let systemCache: SystemCacheService;

  beforeEach(() => {
    store = new InMemoryCacheStore();
    cache = new CacheService(store);
    systemCache = new SystemCacheService(store);
  });

  it('loads once, then serves from cache', async () => {
    const loader = jest.fn(async () => ['A']);

    await RequestContext.run(ctx(1), async () => {
      await cache.getOrSet(CacheKeys.instituteFeatures, [], loader);
      const second = await cache.getOrSet(
        CacheKeys.instituteFeatures,
        [],
        loader,
      );
      expect(second).toEqual(['A']);
    });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('isolates entries between institutes', async () => {
    await RequestContext.run(ctx(1), () =>
      cache.getOrSet(
        CacheKeys.instituteTimezone,
        [],
        async () => 'Asia/Damascus',
      ),
    );
    const other = await RequestContext.run(ctx(2), () =>
      cache.getOrSet(
        CacheKeys.instituteTimezone,
        [],
        async () => 'Africa/Cairo',
      ),
    );

    expect(other).toBe('Africa/Cairo');
  });

  it('invalidates one entry and the whole institute', async () => {
    const loader = jest.fn(async () => 1);

    await RequestContext.run(ctx(1), async () => {
      await cache.getOrSet(CacheKeys.instituteFeatures, [], loader);
      await cache.del(CacheKeys.instituteFeatures, []);
      await cache.getOrSet(CacheKeys.instituteFeatures, [], loader);
      await cache.invalidateInstitute();
      await cache.getOrSet(CacheKeys.instituteFeatures, [], loader);
    });

    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('lets the system cache invalidate another institute (super-admin mutation)', async () => {
    const loader = jest.fn(async () => 'v');

    await RequestContext.run(ctx(5), () =>
      cache.getOrSet(CacheKeys.instituteFeatures, [], loader),
    );
    await systemCache.delForInstitute(5, CacheKeys.instituteFeatures, []);
    await RequestContext.run(ctx(5), () =>
      cache.getOrSet(CacheKeys.instituteFeatures, [], loader),
    );

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('fails open when the store is unavailable', async () => {
    const broken: CacheStore = {
      get: async () => {
        throw new Error('ECONNREFUSED');
      },
      set: async () => {
        throw new Error('ECONNREFUSED');
      },
      del: async () => {
        throw new Error('ECONNREFUSED');
      },
      incr: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    const failing = new CacheService(broken);

    await RequestContext.run(ctx(1), async () => {
      await expect(
        failing.getOrSet(
          CacheKeys.instituteFeatures,
          [],
          async () => 'from-db',
        ),
      ).resolves.toBe('from-db');
      await expect(
        failing.del(CacheKeys.instituteFeatures, []),
      ).resolves.toBeUndefined();
      await expect(failing.invalidateInstitute()).resolves.toBeUndefined();
    });
  });
});
