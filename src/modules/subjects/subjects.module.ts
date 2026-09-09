import { Module } from '@nestjs/common';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';
import { SubjectRepository } from './subject.repository';

@Module({
  controllers: [SubjectsController],
  providers: [SubjectsService, SubjectRepository],
  exports: [SubjectsService, SubjectRepository],
})
export class SubjectsModule {}
