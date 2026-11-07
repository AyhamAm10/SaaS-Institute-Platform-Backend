import { Controller, Inject } from '@nestjs/common';
import { ExamType } from '@prisma/client';
import { NameLookupController } from '../lookup/name-lookup.controller';
import { ExamTypesService } from './exam-types.service';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

@Controller('exam-types')
@RequireResource(Resource.Settings)
export class ExamTypesController extends NameLookupController<ExamType> {
  constructor(@Inject(ExamTypesService) service: ExamTypesService) {
    super(service);
  }
}
