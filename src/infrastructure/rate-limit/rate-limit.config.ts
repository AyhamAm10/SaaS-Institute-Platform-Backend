import { ConfigService } from '@nestjs/config';

export interface RateLimitPolicy {
  /** Max requests per window. */
  limit: number;
  /** Window length (also the block duration once exceeded). */
  windowMs: number;
}

export interface RateLimitConfig {
  /** Every route, per client IP. */
  default: RateLimitPolicy;
  /** Routes marked @LoginRateLimit(field), per client IP + field value. */
  login: RateLimitPolicy;
}

export function resolveRateLimitConfig(config: ConfigService): RateLimitConfig {
  const num = (key: string, fallback: number) =>
    Number(config.get(key) ?? fallback);
  return {
    default: {
      limit: num('THROTTLE_DEFAULT_LIMIT', 300),
      windowMs: num('THROTTLE_DEFAULT_TTL_MS', 60_000),
    },
    login: {
      limit: num('THROTTLE_LOGIN_LIMIT', 5),
      windowMs: num('THROTTLE_LOGIN_TTL_MS', 60_000),
    },
  };
}
