import { jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { LockService } from './lock.service';
import { LockKeys } from './lock-keys';
import { RedisService } from '../redis/redis.service';
import { RequestContext } from '../../context/request-context';

const ctx = {
  userId: 1,
  instituteId: 4,
  role: 'INSTITUTE_ADMIN',
  language: 'en',
};

function createLock(setImpl: () => Promise<string | null>) {
  const client = {
    set: jest.fn(setImpl),
    eval: jest.fn(async () => 1),
  };
  const redis = {
    client,
    key: (...parts: Array<string | number>) => ['ip', ...parts].join(':'),
  } as unknown as RedisService;
  return { lock: new LockService(redis), client };
}

describe('LockService', () => {
  it('runs the operation under an institute-scoped lock and releases it', async () => {
    const { lock, client } = createLock(async () => 'OK');

    const result = await RequestContext.run(ctx, () =>
      lock.withLock(LockKeys.timetableGeneration, [9], async () => 'done'),
    );

    expect(result).toBe('done');
    expect(client.set).toHaveBeenCalledWith(
      'ip:lock:t:4:timetable-generation:9',
      expect.any(String),
      'PX',
      120_000,
      'NX',
    );
    expect(client.eval).toHaveBeenCalledTimes(1);
  });

  it('rejects with 409 when the lock is already held', async () => {
    const { lock } = createLock(async () => null);
    const fn = jest.fn(async () => 'never');

    await expect(
      RequestContext.run(ctx, () =>
        lock.withLock(LockKeys.timetableGeneration, [9], fn),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when Redis is unavailable', async () => {
    const { lock } = createLock(async () => {
      throw new Error('ECONNREFUSED');
    });
    const fn = jest.fn(async () => 'never');

    await expect(
      RequestContext.run(ctx, () =>
        lock.withLock(LockKeys.timetableGeneration, [9], fn),
      ),
    ).rejects.toThrow(HttpException);
    expect(fn).not.toHaveBeenCalled();
  });

  it('releases the lock even when the operation fails', async () => {
    const { lock, client } = createLock(async () => 'OK');

    await expect(
      RequestContext.run(ctx, () =>
        lock.withLock(LockKeys.timetableGeneration, [9], async () => {
          throw new Error('solver failed');
        }),
      ),
    ).rejects.toThrow('solver failed');
    expect(client.eval).toHaveBeenCalledTimes(1);
  });
});
