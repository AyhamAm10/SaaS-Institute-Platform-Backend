import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { UserRole } from '../../common/types/user-role.enum';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { TeacherRepository } from '../teachers/teacher.repository';
import { SectionSubjectRepository } from './section-subject.repository';

export interface TaughtPair {
  sectionId: number;
  subjectId: number;
}

/**
 * Teacher scope (role.md §8.6): a TEACHER only reaches the sections and
 * subjects assigned to them (`SectionSubject.teacherId`). For every other
 * role the methods return `null` / do nothing, i.e. "no restriction".
 * Services call it; the permission guard alone is not enough.
 */
@Injectable()
export class TeacherScopeService {
  constructor(
    @Inject(TeacherRepository)
    private readonly teacherRepository: TeacherRepository,
    @Inject(SectionSubjectRepository)
    private readonly sectionSubjectRepository: SectionSubjectRepository,
  ) {}

  /** True when the caller is a teacher (their scope applies). */
  isTeacher(): boolean {
    return RequestContext.get()?.role === UserRole.TEACHER;
  }

  /** (section, subject) pairs the calling teacher teaches; null = not a teacher. */
  async taughtPairs(): Promise<TaughtPair[] | null> {
    if (!this.isTeacher()) return null;
    const teacher = await this.teacherRepository.findByUserId(
      RequestContext.getUserId(),
    );
    Ensure.forbidden(!teacher, ErrorMessages.get('teacher_not_linked'));
    const rows = await this.sectionSubjectRepository.findMany({
      where: { teacherId: teacher!.id },
    });
    return rows.map((r) => ({
      sectionId: r.sectionId,
      subjectId: r.subjectId,
    }));
  }

  /** Section ids the calling teacher teaches in; null = not a teacher. */
  async taughtSectionIds(): Promise<number[] | null> {
    const pairs = await this.taughtPairs();
    return pairs ? [...new Set(pairs.map((p) => p.sectionId))] : null;
  }

  async assertTeachesSubject(sectionId: number, subjectId: number) {
    const pairs = await this.taughtPairs();
    if (!pairs) return;
    Ensure.forbidden(
      !pairs.some(
        (p) => p.sectionId === sectionId && p.subjectId === subjectId,
      ),
      ErrorMessages.get('teacher_scope_subject'),
    );
  }

  async assertTeachesSection(sectionId: number) {
    const sections = await this.taughtSectionIds();
    if (!sections) return;
    Ensure.forbidden(
      !sections.includes(sectionId),
      ErrorMessages.get('teacher_scope_section'),
    );
  }
}
