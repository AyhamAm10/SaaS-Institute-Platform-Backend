import { Inject, Injectable, Optional } from '@nestjs/common';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { Ensure } from '../../common/errors/ensure';
import { StudentRepository } from '../students/student.repository';
import {
  CreateStudentNoteDto,
  StudentNoteView,
  UpdateStudentNoteDto,
} from './dto/student-note.dto';
import {
  NoteWithAuthor,
  StudentNoteRepository,
} from './student-note.repository';

const toView = (note: NoteWithAuthor): StudentNoteView => ({
  id: note.id,
  studentId: note.studentId,
  body: note.body,
  visibleToFamily: note.visibleToFamily,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  author: note.createdBy?.fullName ?? null,
});

/**
 * Notes for the families (ملاحظات للأهالي): staff write them on the student
 * page; the ones marked visible reach the parents app (`findVisible`, called
 * by the mobile API after it has checked the child belongs to the caller).
 */
@Injectable()
export class StudentNotesService {
  constructor(
    @Inject(StudentNoteRepository)
    private readonly repository: StudentNoteRepository,
    @Inject(StudentRepository)
    private readonly studentRepository: StudentRepository,
    /** Optional so unit tests that do not cover notifications need no mock. */
    @Optional()
    @Inject(NotificationEventsService)
    private readonly events?: NotificationEventsService,
  ) {}

  async findByStudent(studentId: number): Promise<StudentNoteView[]> {
    await this.assertStudent(studentId);
    return (await this.repository.findByStudent(studentId)).map(toView);
  }

  /** What the family may read. The caller proves the child is theirs. */
  async findVisible(studentId: number): Promise<StudentNoteView[]> {
    return (await this.repository.findByStudent(studentId, true)).map(toView);
  }

  async create(
    studentId: number,
    dto: CreateStudentNoteDto,
  ): Promise<StudentNoteView> {
    await this.assertStudent(studentId);
    const note = await this.repository.create({
      studentId,
      body: dto.body,
      visibleToFamily: dto.visibleToFamily ?? true,
    });
    const view = await this.getView(note.id);
    this.announce(view);
    return view;
  }

  async update(
    id: number,
    dto: UpdateStudentNoteDto,
  ): Promise<StudentNoteView> {
    const existing = await this.repository.findById(id);
    Ensure.exists(existing, 'Note');
    await this.assertStudent(existing.studentId);
    await this.repository.update(id, {
      ...(dto.body !== undefined && { body: dto.body }),
      ...(dto.visibleToFamily !== undefined && {
        visibleToFamily: dto.visibleToFamily,
      }),
    });
    const view = await this.getView(id);
    // A note made visible later reaches the family then (once per note)
    this.announce(view);
    return view;
  }

  /** Families hear about notes meant for them. */
  private announce(note: StudentNoteView): void {
    if (!note.visibleToFamily) return;
    void this.events?.studentNote({ noteId: note.id, studentId: note.studentId, body: note.body });
  }

  async remove(id: number): Promise<void> {
    const existing = await this.repository.findById(id);
    Ensure.exists(existing, 'Note');
    await this.assertStudent(existing.studentId);
    await this.repository.delete(id);
  }

  /** The student exists (and is in the caller's branch context). */
  private async assertStudent(studentId: number): Promise<void> {
    const student = await this.studentRepository.findById(studentId);
    Ensure.exists(student, 'Student');
  }

  private async getView(id: number): Promise<StudentNoteView> {
    const note = await this.repository.findWithAuthor(id);
    Ensure.exists(note, 'Note');
    return toView(note);
  }
}
