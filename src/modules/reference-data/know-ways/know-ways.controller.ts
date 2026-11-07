import { Controller, Inject } from '@nestjs/common';
import { KnowWay } from '@prisma/client';
import { NameLookupController } from '../lookup/name-lookup.controller';
import { KnowWaysService } from './know-ways.service';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

@Controller('know-ways')
@RequireResource(Resource.Settings)
export class KnowWaysController extends NameLookupController<KnowWay> {
  constructor(@Inject(KnowWaysService) service: KnowWaysService) {
    super(service);
  }
}
