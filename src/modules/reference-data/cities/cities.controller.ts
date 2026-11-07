import { Controller, Inject } from '@nestjs/common';
import { City } from '@prisma/client';
import { NameLookupController } from '../lookup/name-lookup.controller';
import { CitiesService } from './cities.service';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

@Controller('cities')
@RequireResource(Resource.Settings)
export class CitiesController extends NameLookupController<City> {
  constructor(@Inject(CitiesService) service: CitiesService) {
    super(service);
  }
}
