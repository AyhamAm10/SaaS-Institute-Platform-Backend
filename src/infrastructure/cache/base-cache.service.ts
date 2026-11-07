import { Logger } from '@nestjs/common';
import { CacheStore } from './cache-store';

/** Key of the per-institute version counter (bumped to invalidate all its entries). */
export function tenantVersionKey(instituteId: number): string {
  return `t:${instituteId}:ver`;
}

/** Full key of a tenant entry: `t:{instituteId}:v{version}:{name}`. */
export function tenantEntryKey(
  instituteId: number,
  version: number,
  name: string,
): string {
  return `t:${instituteId}:v${version}:${name}`;
}

/**
 * Shared read-through / fail-open logic of CacheService and SystemCacheService.
 *
 * Fail-open: any store error is logged and the loader result is returned, so a
 * Redis outage degrades performance but never breaks a request.
 * Values must be JSON-safe DTOs (no Prisma Decimal / Date instances).
 */
export abstract class BaseCacheService {
  protected abstract readonly logger: Logger;

  protected constructor(protected readonly store: CacheStore) {}

  /** `resolveKey` may itself hit the store (tenant version): its failures fail open too. */
  protected async readThrough<T>(
    resolveKey: () => Promise<string>,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    let key: string;
    try {
      key = await resolveKey();
      const cached = await this.store.get(key);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch (err) {
      this.warn('read', '(key)', err);
      return loader();
    }

    const value = await loader();
    try {
      await this.store.set(key, JSON.stringify(value), ttlSeconds);
    } catch (err) {
      this.warn('write', key, err);
    }
    return value;
  }

  protected async remove(resolveKey: () => Promise<string>): Promise<void> {
    try {
      await this.store.del([await resolveKey()]);
    } catch (err) {
      this.warn('delete', '(key)', err);
    }
  }

  protected async tenantVersion(instituteId: number): Promise<number> {
    return Number((await this.store.get(tenantVersionKey(instituteId))) ?? 0);
  }

  /** Invalidates every entry of an institute by bumping its version. */
  protected async bumpTenantVersion(instituteId: number): Promise<void> {
    try {
      await this.store.incr(tenantVersionKey(instituteId));
    } catch (err) {
      this.warn('invalidate', tenantVersionKey(instituteId), err);
    }
  }

  /** Full key of a tenant entry at its current version. */
  protected async currentTenantKey(
    instituteId: number,
    name: string,
  ): Promise<string> {
    return tenantEntryKey(
      instituteId,
      await this.tenantVersion(instituteId),
      name,
    );
  }

  private warn(operation: string, key: string, err: unknown): void {
    this.logger.warn(
      `Cache ${operation} failed for "${key}": ${(err as Error).message}`,
    );
  }
}
