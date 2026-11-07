import { ConfigService } from '@nestjs/config';

export interface RedisConfig {
  /** Connection URL, e.g. `redis://localhost:6379`. */
  url: string;
  /** Namespace for every key of this deployment, e.g. `ip:dev`. */
  keyPrefix: string;
}

/** Reads the Redis configuration (fails fast when REDIS_URL is missing). */
export function resolveRedisConfig(config: ConfigService): RedisConfig {
  return {
    url: config.getOrThrow<string>('REDIS_URL'),
    keyPrefix: config.get<string>('REDIS_KEY_PREFIX') ?? 'ip',
  };
}
