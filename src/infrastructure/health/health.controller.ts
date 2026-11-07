import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService, HealthStatus } from './health.service';

/** Liveness endpoint for monitoring and local checks: `GET /health`. */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Public()
  @Get()
  async check(): Promise<HealthStatus> {
    return this.healthService.check();
  }
}
