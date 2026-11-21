import { Controller, Inject } from '@nestjs/common';
import { Religion } from '@prisma/client';
import { NameLookupController } from '../lookup/name-lookup.controller';
import { ReligionsService } from './religions.service';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

@Controller('religions')
@RequireResource(Resource.Settings)
export class ReligionsController extends NameLookupController<Religion> {
  constructor(@Inject(ReligionsService) service: ReligionsService) {
    super(service);
  }
}
