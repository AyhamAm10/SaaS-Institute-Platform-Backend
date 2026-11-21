import { Controller, Inject } from '@nestjs/common';
import { Language } from '@prisma/client';
import { NameLookupController } from '../lookup/name-lookup.controller';
import { LanguagesService } from './languages.service';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

@Controller('languages')
@RequireResource(Resource.Settings)
export class LanguagesController extends NameLookupController<Language> {
  constructor(@Inject(LanguagesService) service: LanguagesService) {
    super(service);
  }
}
