import { jest } from '@jest/globals';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RateLimitStore } from './rate-limit.store';
import { RateLimitGuard } from './rate-limit.guard';
import { RedisService } from '../redis/redis.service';

function redisWith(evalImpl: () => Promise<unknown>) {
  return {
    client: { eval: jest.fn(evalImpl) },
    key: (...parts: Array<string | number>) => ['ip', ...parts].join(':'),
  } as unknown as RedisService;
}

describe('RateLimitStore', () => {
  it('maps the Lua result to a rate-limit result', async () => {
    const redis = redisWith(async () => [6, 1, 59_200]);
    const store = new RateLimitStore(redis);

    const result = await store.hit('login:1.2.3.4:0999', 60_000, 5);

    expect(result).toEqual({
      totalHits: 6,
      blocked: true,
      retryAfterSeconds: 60,
    });
    expect(redis.client.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'ip:ratelimit:login:1.2.3.4:0999',
      'ip:ratelimit:login:1.2.3.4:0999:blocked',
      60_000,
      5,
      60_000,
    );
  });

  it('fails open when Redis is unavailable', async () => {
    const store = new RateLimitStore(
      redisWith(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    await expect(store.hit('k', 60_000, 5)).resolves.toMatchObject({
      blocked: false,
    });
  });
});

describe('RateLimitGuard', () => {
  const config = { get: () => undefined } as unknown as ConfigService;

  function contextFor(loginField: string | undefined) {
    const setHeader = jest.fn();
    const reflector = {
      getAllAndOverride: () => loginField,
    } as unknown as Reflector;
    const context = {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ ip: '1.2.3.4', body: { phone: '0999' } }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    return { context, reflector, setHeader };
  }

  it('checks only the default policy on normal routes', async () => {
    const store = {
      hit: jest.fn(async () => ({
        totalHits: 1,
        blocked: false,
        retryAfterSeconds: 0,
      })),
    };
    const { context, reflector } = contextFor(undefined);
    const guard = new RateLimitGuard(
      reflector,
      store as unknown as RateLimitStore,
      config,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(store.hit).toHaveBeenCalledTimes(1);
    expect(store.hit).toHaveBeenCalledWith('default:1.2.3.4', 60_000, 300);
  });

  it('tracks login attempts by IP + phone and returns 429 with Retry-After', async () => {
    const store = {
      hit: jest.fn(async (key: string) =>
        key.startsWith('login:')
          ? { totalHits: 6, blocked: true, retryAfterSeconds: 42 }
          : { totalHits: 1, blocked: false, retryAfterSeconds: 0 },
      ),
    };
    const { context, reflector, setHeader } = contextFor('phone');
    const guard = new RateLimitGuard(
      reflector,
      store as unknown as RateLimitStore,
      config,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(store.hit).toHaveBeenCalledWith('login:1.2.3.4:0999', 60_000, 5);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 42);
  });
});
