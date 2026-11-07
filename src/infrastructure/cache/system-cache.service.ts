import { Inject, Injectable, Logger } from '@nestjs/common';
import { BaseCacheService } from './base-cache.service';
import { CACHE_STORE } from './cache-store';
import type { CacheStore } from './cache-store';
import { CacheKeyDef } from './cache-keys';

/**
 * System-level cache — the cache counterpart of SystemRepository.
 *
 * Used ONLY for platform-wide entries and for super-admin operations that
 * change another institute's data and must invalidate that institute's cache.
 * Feature code that acts on the caller's own institute uses CacheService.
 */
@Injectable()
export class SystemCacheService extends BaseCacheService {
  protected readonly logger = new Logger(SystemCacheService.name);

  constructor(@Inject(CACHE_STORE) store: CacheStore) {
    super(store);
  }

  /** Read-through for platform-wide (non-tenant) entries: `sys:{name}`. */
  async getOrSet<T, A extends unknown[]>(
    def: CacheKeyDef<A>,
    args: A,
    loader: () => Promise<T>,
  ): Promise<T> {
    return this.readThrough(
      async () => `sys:${def.build(...args)}`,
      def.ttlSeconds,
      loader,
    );
  }

  /** Removes one tenant entry of a given institute (super-admin mutations). */
  async delForInstitute<A extends unknown[]>(
    instituteId: number,
    def: CacheKeyDef<A>,
    args: A,
  ): Promise<void> {
    await this.remove(() =>
      this.currentTenantKey(instituteId, def.build(...args)),
    );
  }

  /** Invalidates every cached entry of a given institute. */
  async invalidateInstitute(instituteId: number): Promise<void> {
    await this.bumpTenantVersion(instituteId);
  }
}
