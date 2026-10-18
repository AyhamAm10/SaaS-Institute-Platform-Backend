import { Module } from '@nestjs/common';
import { StudentFieldsController } from './student-fields.controller';
import { StudentFieldsService } from './student-fields.service';
import { StudentFieldRepository } from './student-field.repository';

@Module({
  controllers: [StudentFieldsController],
  providers: [StudentFieldsService, StudentFieldRepository],
  exports: [StudentFieldsService, StudentFieldRepository],
})
export class StudentFieldsModule {}
