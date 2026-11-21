import { Inject, Injectable } from '@nestjs/common';
import { Religion } from '@prisma/client';
import { LookupService } from '../lookup/lookup.service';
import { CreateLookupDto, UpdateLookupDto } from '../lookup/dto/lookup.dto';
import { ReligionRepository } from './religion.repository';

@Injectable()
export class ReligionsService extends LookupService<
  Religion,
  CreateLookupDto,
  UpdateLookupDto
> {
  constructor(@Inject(ReligionRepository) repository: ReligionRepository) {
    super(repository, 'resource_religion');
  }
}
