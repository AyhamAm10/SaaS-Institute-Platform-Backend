import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CacheStore } from './cache-store';

/** CacheStore backed by Redis; every key lives under `{prefix}:cache:`. */
@Injectable()
export class RedisCacheStore implements CacheStore {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async get(key: string): Promise<string | null> {
    return this.redis.client.get(this.redis.key('cache', key));
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.client.set(
      this.redis.key('cache', key),
      value,
      'EX',
      ttlSeconds,
    );
  }

  async del(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.redis.client.del(...keys.map((k) => this.redis.key('cache', k)));
  }

  async incr(key: string): Promise<number> {
    return this.redis.client.incr(this.redis.key('cache', key));
  }
}
