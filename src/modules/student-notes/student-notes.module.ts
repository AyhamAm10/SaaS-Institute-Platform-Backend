import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StudentsModule } from '../students/students.module';
import { StudentNotesController } from './student-notes.controller';
import { StudentNotesService } from './student-notes.service';
import { StudentNoteRepository } from './student-note.repository';

/** Notes for the families (ملاحظات للأهالي). */
@Module({
  imports: [StudentsModule, NotificationsModule],
  controllers: [StudentNotesController],
  providers: [StudentNotesService, StudentNoteRepository],
  exports: [StudentNotesService],
})
export class StudentNotesModule {}
