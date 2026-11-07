import { Controller, Get, Inject } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/** Dashboard home numbers (phase 3 D1). Read-only. */
@Controller('dashboard')
@RequireResource(Resource.Dashboard)
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService,
  ) {}

  /** Header branch and header (or current) academic year; local dates. */
  @Get('overview')
  async overview() {
    return this.dashboard.getOverview();
  }
}
