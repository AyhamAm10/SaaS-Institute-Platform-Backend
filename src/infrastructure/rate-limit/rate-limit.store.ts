import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface RateLimitResult {
  totalHits: number;
  blocked: boolean;
  /** Seconds until the client may try again (0 when not blocked). */
  retryAfterSeconds: number;
}

/**
 * Atomic fixed-window counter with blocking:
 * KEYS[1] = hits key, KEYS[2] = block key; ARGV = windowMs, limit, blockMs.
 * Returns { hits, blocked (0/1), blockTtlMs }.
 */
const HIT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then return {0, 1, blockTtl} end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, 1, tonumber(ARGV[3])}
end
return {hits, 0, 0}
`;

/**
 * Redis-backed request counters, shared by every app instance.
 * Fail-open: when Redis is unavailable nothing is throttled (logged), so an
 * outage never blocks the API (role.md §14.2).
 */
@Injectable()
export class RateLimitStore {
  private readonly logger = new Logger(RateLimitStore.name);

  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async hit(
    key: string,
    windowMs: number,
    limit: number,
  ): Promise<RateLimitResult> {
    try {
      const [hits, blocked, blockTtlMs] = (await this.redis.client.eval(
        HIT_SCRIPT,
        2,
        this.redis.key('ratelimit', key),
        this.redis.key('ratelimit', key, 'blocked'),
        windowMs,
        limit,
        windowMs,
      )) as [number, number, number];

      return {
        totalHits: hits,
        blocked: blocked === 1,
        retryAfterSeconds: Math.ceil(blockTtlMs / 1000),
      };
    } catch (err) {
      this.logger.warn(
        `Rate limiting skipped (Redis unavailable): ${(err as Error).message}`,
      );
      return { totalHits: 0, blocked: false, retryAfterSeconds: 0 };
    }
  }
}
