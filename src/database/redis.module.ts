import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Global module providing RedisService.
 * Available in all modules without explicit imports.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
