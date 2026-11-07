import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisConfig, resolveRedisConfig } from './redis.config';

/** Plain connection parameters for libraries that open their own connection. */
export interface RedisConnectionParams {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
}

/**
 * RedisService
 *
 * Owns the Redis connection — the ONLY place that knows about ioredis
 * (role.md §14.2). Domain code never uses it directly: it goes through the
 * purpose-specific services (CacheService, LockService, rate limiting, queues).
 *
 * The command connection fails fast (no offline queue) so cache callers can
 * fall back to the database immediately when Redis is down.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly config: RedisConfig;
  readonly client: Redis;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.config = resolveRedisConfig(configService);
    this.client = new Redis(this.config.url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', (err: Error) =>
      this.logger.warn(`Redis connection error: ${err.message}`),
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.log('Connected to Redis');
    } catch (err) {
      // Not fatal: cache and rate limiting fail open; locks/queues report errors.
      this.logger.error(
        `Redis is unavailable at startup: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    // quit() waits for pending replies and would hang while reconnecting;
    // disconnect() stops the retry loop immediately.
    if (this.client.status === 'ready') await this.client.quit();
    else this.client.disconnect();
  }

  /** Builds a namespaced key: `{prefix}:{part1}:{part2}…`. */
  key(...parts: Array<string | number>): string {
    return [this.config.keyPrefix, ...parts].join(':');
  }

  /** Key namespace, for libraries that prefix keys themselves (BullMQ). */
  get keyPrefix(): string {
    return this.config.keyPrefix;
  }

  /**
   * Options for a dedicated connection (BullMQ opens its own): parsed from
   * REDIS_URL, with `maxRetriesPerRequest: null` as BullMQ requires.
   */
  connectionOptions(): RedisConnectionParams {
    const url = new URL(this.config.url);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
