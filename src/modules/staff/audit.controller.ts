import { Controller, Get, Inject, Query } from '@nestjs/common';
import { AuditViewService } from './audit-view.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/** Audit viewer: admins only (staff permission). Read-only. */
@Controller('audit-log')
@RequireResource(Resource.Staff)
export class AuditController {
  constructor(@Inject(AuditViewService) private readonly audit: AuditViewService) {}

  @Get()
  async search(@Query() query: AuditQueryDto) {
    return this.audit.search(query);
  }
}
