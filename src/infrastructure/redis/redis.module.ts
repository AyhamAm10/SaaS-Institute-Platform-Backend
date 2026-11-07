import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Global Redis connection module. Imported once in AppModule; consumed only by
 * the infrastructure services under src/infrastructure (role.md §14.2).
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
