import { Global, Module } from '@nestjs/common';
import { LockService } from './lock.service';

/** Global distributed-lock module (Redis-backed). Requires RedisModule. */
@Global()
@Module({
  providers: [LockService],
  exports: [LockService],
})
export class LockModule {}
