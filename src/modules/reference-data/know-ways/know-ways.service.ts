import { Inject, Injectable } from '@nestjs/common';
import { KnowWay } from '@prisma/client';
import { LookupService } from '../lookup/lookup.service';
import { CreateLookupDto, UpdateLookupDto } from '../lookup/dto/lookup.dto';
import { KnowWayRepository } from './know-way.repository';

@Injectable()
export class KnowWaysService extends LookupService<
  KnowWay,
  CreateLookupDto,
  UpdateLookupDto
> {
  constructor(@Inject(KnowWayRepository) repository: KnowWayRepository) {
    super(repository, 'resource_know_way');
  }
}
