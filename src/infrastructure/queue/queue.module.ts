import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisService } from '../redis/redis.service';

/**
 * Background jobs (BullMQ on Redis).
 *
 * Shared connection + defaults for every queue. Feature modules register their
 * own queues with `BullModule.registerQueue({ name })` (names in a central
 * `queue-names.ts` registry) and implement workers by extending TenantJobProcessor.
 * Defaults: 3 attempts with exponential backoff; completed jobs are trimmed,
 * failed jobs are kept for inspection.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        connection: redis.connectionOptions(),
        prefix: `${redis.keyPrefix}:bull`,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 1000,
          removeOnFail: false,
        },
      }),
    }),
  ],
})
export class QueueModule {}
