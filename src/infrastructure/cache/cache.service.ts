import { Inject, Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { BaseCacheService } from './base-cache.service';
import { CACHE_STORE } from './cache-store';
import type { CacheStore } from './cache-store';
import { CacheKeyDef } from './cache-keys';

/**
 * Tenant-aware cache — the cache counterpart of TenantAwareRepository.
 *
 * Every key is scoped to the caller's institute (resolved from RequestContext,
 * never from arguments), so one institute can never read another's entries.
 * Only the service that owns the data caches it and invalidates it after
 * mutations (role.md §10, §14.2).
 */
@Injectable()
export class CacheService extends BaseCacheService {
  protected readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_STORE) store: CacheStore) {
    super(store);
  }

  /** Returns the cached value, or loads, caches and returns it. */
  async getOrSet<T, A extends unknown[]>(
    def: CacheKeyDef<A>,
    args: A,
    loader: () => Promise<T>,
  ): Promise<T> {
    const instituteId = RequestContext.getInstituteId();
    return this.readThrough(
      () => this.currentTenantKey(instituteId, def.build(...args)),
      def.ttlSeconds,
      loader,
    );
  }

  /** Removes one entry of the caller's institute. */
  async del<A extends unknown[]>(def: CacheKeyDef<A>, args: A): Promise<void> {
    const instituteId = RequestContext.getInstituteId();
    await this.remove(() =>
      this.currentTenantKey(instituteId, def.build(...args)),
    );
  }

  /** Invalidates every cached entry of the caller's institute. */
  async invalidateInstitute(): Promise<void> {
    await this.bumpTenantVersion(RequestContext.getInstituteId());
  }
}
