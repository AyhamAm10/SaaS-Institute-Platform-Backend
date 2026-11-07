import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  postgres: 'up' | 'down';
  redis: 'up' | 'down';
}

/** Infrastructure liveness probes (no domain data). */
@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthStatus> {
    const [postgres, redis] = await Promise.all([
      this.prisma.ping(),
      this.redis.ping(),
    ]);
    return {
      status: postgres && redis ? 'ok' : 'degraded',
      postgres: postgres ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
    };
  }
}
