import { Inject, Injectable } from '@nestjs/common';
import { School } from '@prisma/client';
import { LookupService } from '../lookup/lookup.service';
import { CitiesService } from '../cities/cities.service';
import { SchoolRepository } from './school.repository';
import { CreateSchoolDto, UpdateSchoolDto } from './dto/school.dto';

@Injectable()
export class SchoolsService extends LookupService<
  School,
  CreateSchoolDto,
  UpdateSchoolDto
> {
  constructor(
    @Inject(SchoolRepository) repository: SchoolRepository,
    @Inject(CitiesService) private readonly citiesService: CitiesService,
  ) {
    super(repository, 'resource_school');
  }

  protected override toData(
    dto: CreateSchoolDto | UpdateSchoolDto,
  ): Record<string, unknown> {
    return dto.cityId !== undefined ? { cityId: dto.cityId } : {};
  }

  /** The city (when given) must exist in the institute. */
  protected override async validate(
    dto: CreateSchoolDto | UpdateSchoolDto,
  ): Promise<void> {
    if (dto.cityId) await this.citiesService.getById(dto.cityId);
  }
}
