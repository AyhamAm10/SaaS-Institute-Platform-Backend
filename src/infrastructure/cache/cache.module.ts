import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { SystemCacheService } from './system-cache.service';
import { RedisCacheStore } from './redis-cache.store';
import { CACHE_STORE } from './cache-store';

/** Global cache module (Redis-backed). Requires RedisModule. */
@Global()
@Module({
  providers: [
    RedisCacheStore,
    { provide: CACHE_STORE, useExisting: RedisCacheStore },
    CacheService,
    SystemCacheService,
  ],
  exports: [CacheService, SystemCacheService],
})
export class CacheModule {}
