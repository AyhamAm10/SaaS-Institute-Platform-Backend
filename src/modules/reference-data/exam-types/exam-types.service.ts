import { Inject, Injectable } from '@nestjs/common';
import { ExamType } from '@prisma/client';
import { LookupService } from '../lookup/lookup.service';
import { CreateLookupDto, UpdateLookupDto } from '../lookup/dto/lookup.dto';
import { ExamTypeRepository } from './exam-type.repository';

@Injectable()
export class ExamTypesService extends LookupService<
  ExamType,
  CreateLookupDto,
  UpdateLookupDto
> {
  constructor(@Inject(ExamTypeRepository) repository: ExamTypeRepository) {
    super(repository, 'resource_exam_type');
  }
}
