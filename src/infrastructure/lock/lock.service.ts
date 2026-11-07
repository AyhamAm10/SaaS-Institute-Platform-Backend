import { randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { ErrorMessages } from '../../common/errors/error-messages';
import { RedisService } from '../redis/redis.service';
import { LockDef } from './lock-keys';

/** Deletes the lock only if we still own it (token match). */
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

/**
 * Distributed mutual exclusion, scoped to the caller's institute.
 *
 * Fail-closed (role.md §14.2): if the lock is held → 409
 * `operation_in_progress`; if Redis is unavailable → 503 `service_unavailable`.
 * Never runs the protected operation without the lock.
 */
@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);

  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async withLock<T, A extends unknown[]>(
    def: LockDef<A>,
    args: A,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = this.redis.key(
      'lock',
      't',
      RequestContext.getInstituteId(),
      def.build(...args),
    );
    const token = randomUUID();

    let acquired: string | null;
    try {
      acquired = await this.redis.client.set(key, token, 'PX', def.ttlMs, 'NX');
    } catch (err) {
      this.logger.error(`Lock "${key}" unavailable: ${(err as Error).message}`);
      throw new HttpException(
        ErrorMessages.get('service_unavailable'),
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (acquired !== 'OK') {
      throw new HttpException(
        ErrorMessages.get('operation_in_progress'),
        HttpStatus.CONFLICT,
      );
    }

    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }

  private async release(key: string, token: string): Promise<void> {
    try {
      await this.redis.client.eval(RELEASE_SCRIPT, 1, key, token);
    } catch (err) {
      // The TTL frees it anyway; log so a stuck lock can be traced.
      this.logger.warn(
        `Failed to release lock "${key}": ${(err as Error).message}`,
      );
    }
  }
}
