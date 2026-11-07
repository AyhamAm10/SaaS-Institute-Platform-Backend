import { Inject, Injectable } from '@nestjs/common';
import { City } from '@prisma/client';
import { LookupService } from '../lookup/lookup.service';
import { CreateLookupDto, UpdateLookupDto } from '../lookup/dto/lookup.dto';
import { CityRepository } from './city.repository';

@Injectable()
export class CitiesService extends LookupService<
  City,
  CreateLookupDto,
  UpdateLookupDto
> {
  constructor(@Inject(CityRepository) repository: CityRepository) {
    super(repository, 'resource_city');
  }
}
