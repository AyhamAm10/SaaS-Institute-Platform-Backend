import { Inject, Injectable } from '@nestjs/common';
import { Language } from '@prisma/client';
import { LookupService } from '../lookup/lookup.service';
import { CreateLookupDto, UpdateLookupDto } from '../lookup/dto/lookup.dto';
import { LanguageRepository } from './language.repository';

@Injectable()
export class LanguagesService extends LookupService<
  Language,
  CreateLookupDto,
  UpdateLookupDto
> {
  constructor(@Inject(LanguageRepository) repository: LanguageRepository) {
    super(repository, 'resource_language');
  }
}
