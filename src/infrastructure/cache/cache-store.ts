/** DI token of the low-level cache store (Redis in the app, in-memory in tests). */
export const CACHE_STORE = Symbol('CACHE_STORE');

/**
 * Minimal string key/value store behind CacheService / SystemCacheService.
 * Keys passed here are already fully built (tenant + version + name).
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  /** Atomically increments an integer key (used for tenant cache versions). */
  incr(key: string): Promise<number>;
}
