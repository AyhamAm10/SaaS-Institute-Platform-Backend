/**
 * Central registry of cache keys (like ErrorMessages): every cached value is
 * declared here with its TTL. Ad-hoc key strings in domain code are forbidden
 * (role.md §14.2).
 */
export interface CacheKeyDef<A extends unknown[] = []> {
  build: (...args: A) => string;
  ttlSeconds: number;
}

function defineCacheKey<A extends unknown[] = []>(
  build: (...args: A) => string,
  ttlSeconds: number,
): CacheKeyDef<A> {
  return { build, ttlSeconds };
}

export const CacheKeys = {
  /** Feature flags of the institute (InstituteFeaturesService). */
  instituteFeatures: defineCacheKey(() => 'features', 10 * 60),
  /** IANA time zone of the institute (InstituteClockService). */
  instituteTimezone: defineCacheKey(() => 'timezone', 60 * 60),
};
