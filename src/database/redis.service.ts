import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Injectable Redis service wrapping ioredis with in-memory fallback.
 *
 * Provides a clean interface for key-value operations with TTL support.
 * Handles connection lifecycle via NestJS hooks.
 *
 * If Redis server is not available (e.g. during local tests without a Redis daemon),
 * it falls back to an in-memory store so the application remains fully functional.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private isConnected = false;
  private readonly memoryStore = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      retryStrategy: () => null, // Don't crash with infinite retry logs if Redis is down
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log('Connected to Redis');
    });

    this.client.on('error', (err: Error) => {
      if (this.isConnected) {
        this.logger.error(`Redis error: ${err.message}`);
      }
      this.isConnected = false;
    });

    // Attempt connection
    this.client.connect().catch((err: Error) => {
      this.logger.warn(`Redis not reachable at localhost:6379 (${err.message}). Using in-memory store fallback.`);
      this.isConnected = false;
    });
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected) {
      try {
        return await this.client.get(key);
      } catch {
        // Fallback to memory store if call fails
      }
    }

    const item = this.memoryStore.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.memoryStore.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isConnected) {
      try {
        if (ttlSeconds) {
          await this.client.setex(key, ttlSeconds, value);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {
        // Fallback to memory store
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.memoryStore.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected) {
      try {
        await this.client.del(key);
      } catch {
        // Fallback
      }
    }
    this.memoryStore.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this.isConnected) {
      try {
        const result = await this.client.exists(key);
        return result === 1;
      } catch {
        // Fallback
      }
    }
    const item = this.memoryStore.get(key);
    if (!item) return false;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.memoryStore.delete(key);
      return false;
    }
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.quit();
      } else {
        this.client.disconnect();
      }
    } catch {
      // Ignore disconnect errors on shutdown
    }
    this.logger.log('RedisService destroyed');
  }
}
