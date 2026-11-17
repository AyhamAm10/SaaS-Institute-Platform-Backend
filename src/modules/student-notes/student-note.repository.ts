import { Inject, Injectable } from '@nestjs/common';
import { StudentNote } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

export type NoteWithAuthor = StudentNote & {
  createdBy: { fullName: string } | null;
};

const INCLUDE = { createdBy: { select: { fullName: true } } } as const;

/**
 * Notes about students. Institute-scoped, not branch / year scoped: a note
 * follows the student (the student's branch is checked by the service).
 */
@Injectable()
export class StudentNoteRepository extends TenantAwareRepository<StudentNote> {
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'studentNote');
  }

  /** Newest first; `onlyVisible` keeps what the family may read. */
  async findByStudent(
    studentId: number,
    onlyVisible = false,
  ): Promise<NoteWithAuthor[]> {
    return this.client.studentNote.findMany({
      where: this.scopeWhere({
        studentId,
        ...(onlyVisible && { visibleToFamily: true }),
      }),
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    }) as Promise<NoteWithAuthor[]>;
  }

  async findWithAuthor(id: number): Promise<NoteWithAuthor | null> {
    return this.client.studentNote.findFirst({
      where: this.scopeWhere({ id }),
      include: INCLUDE,
    }) as Promise<NoteWithAuthor | null>;
  }
}
