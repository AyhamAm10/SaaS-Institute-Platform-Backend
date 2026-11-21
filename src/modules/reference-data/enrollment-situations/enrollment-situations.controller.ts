import { Controller, Inject } from '@nestjs/common';
import { EnrollmentSituation } from '@prisma/client';
import { NameLookupController } from '../lookup/name-lookup.controller';
import { EnrollmentSituationsService } from './enrollment-situations.service';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

@Controller('enrollment-situations')
@RequireResource(Resource.Settings)
export class EnrollmentSituationsController extends NameLookupController<EnrollmentSituation> {
  constructor(@Inject(EnrollmentSituationsService) service: EnrollmentSituationsService) {
    super(service);
  }
}
