import { Inject, Injectable } from '@nestjs/common';
import { Nationality } from '@prisma/client';
import { LookupService } from '../lookup/lookup.service';
import { CreateLookupDto, UpdateLookupDto } from '../lookup/dto/lookup.dto';
import { NationalityRepository } from './nationality.repository';

@Injectable()
export class NationalitiesService extends LookupService<
  Nationality,
  CreateLookupDto,
  UpdateLookupDto
> {
  constructor(@Inject(NationalityRepository) repository: NationalityRepository) {
    super(repository, 'resource_nationality');
  }
}
