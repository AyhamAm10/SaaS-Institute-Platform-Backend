import { Inject, Injectable } from '@nestjs/common';
import { EnrollmentSituation } from '@prisma/client';
import { LookupService } from '../lookup/lookup.service';
import { CreateLookupDto, UpdateLookupDto } from '../lookup/dto/lookup.dto';
import { EnrollmentSituationRepository } from './enrollment-situation.repository';

@Injectable()
export class EnrollmentSituationsService extends LookupService<
  EnrollmentSituation,
  CreateLookupDto,
  UpdateLookupDto
> {
  constructor(@Inject(EnrollmentSituationRepository) repository: EnrollmentSituationRepository) {
    super(repository, 'resource_enrollment_situation');
  }
}
