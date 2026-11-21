import { Controller, Inject } from '@nestjs/common';
import { Nationality } from '@prisma/client';
import { NameLookupController } from '../lookup/name-lookup.controller';
import { NationalitiesService } from './nationalities.service';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

@Controller('nationalities')
@RequireResource(Resource.Settings)
export class NationalitiesController extends NameLookupController<Nationality> {
  constructor(@Inject(NationalitiesService) service: NationalitiesService) {
    super(service);
  }
}
