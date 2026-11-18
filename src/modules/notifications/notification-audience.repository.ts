import { Inject, Injectable } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/** A student with the accounts that hear about them (guardians + the student). */
export interface StudentAudience {
  studentId: number;
  fullName: string;
  female: boolean;
  /** Active guardian accounts of the student's family. */
  familyUserIds: number[];
  /** The student's own active account, if any. */
  studentUserId: number | null;
}

const activeUser = { isActive: true, deletedAt: null } as const;

/**
 * Read-only queries that decide who receives a notification. Kept inside the
 * notifications module (it never imports domain modules, so every domain can
 * depend on it without cycles). Every query is filtered by the institute.
 */
@Injectable()
export class NotificationAudienceRepository extends TenantAwareRepository<Notification> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'notification');
  }

  async students(studentIds: number[]): Promise<StudentAudience[]> {
    if (studentIds.length === 0) return [];
    const rows = await this.client.student.findMany({
      where: { instituteId: this.getInstituteId(), id: { in: studentIds }, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        gender: true,
        user: { select: { id: true, isActive: true, deletedAt: true } },
        family: {
          select: {
            familyUsers: {
              where: { user: activeUser },
              select: { userId: true },
            },
          },
        },
      },
    });
    return rows.map(
      (s: {
        id: number;
        fullName: string;
        gender: string;
        user: { id: number; isActive: boolean; deletedAt: Date | null } | null;
        family: { familyUsers: { userId: number }[] } | null;
      }) => ({
        studentId: s.id,
        fullName: s.fullName,
        female: s.gender === 'FEMALE',
        familyUserIds: (s.family?.familyUsers ?? []).map((f) => f.userId),
        studentUserId:
          s.user && s.user.isActive && !s.user.deletedAt ? s.user.id : null,
      }),
    );
  }

  /** Students with an ACTIVE enrollment in the section (who study `subjectId` when given). */
  async sectionStudentIds(sectionId: number, subjectId?: number): Promise<number[]> {
    const rows: { studentId: number }[] =
      await this.client.studentEnrollment.findMany({
        where: {
          instituteId: this.getInstituteId(),
          sectionId,
          status: 'ACTIVE',
          student: { deletedAt: null },
          ...(subjectId && {
            OR: [
              { subjects: { none: {} } },
              { subjects: { some: { subjectId, status: 'ACTIVE' } } },
            ],
          }),
        },
        select: { studentId: true },
      });
    return rows.map((r) => r.studentId);
  }

  /** Students with an ACTIVE enrollment in any of the sections, or in the branch / institute. */
  async studentsIn(scope: { branchId?: number; sectionIds?: number[] }): Promise<number[]> {
    const rows: { studentId: number }[] =
      await this.client.studentEnrollment.findMany({
        where: {
          instituteId: this.getInstituteId(),
          status: 'ACTIVE',
          student: {
            deletedAt: null,
            ...(scope.branchId && { branchId: scope.branchId }),
          },
          ...(scope.sectionIds && { sectionId: { in: scope.sectionIds } }),
        },
        select: { studentId: true },
        distinct: ['studentId'],
      });
    return rows.map((r) => r.studentId);
  }

  /** teacherId -> active user id. */
  async teacherUsers(teacherIds: number[]): Promise<Map<number, number>> {
    if (teacherIds.length === 0) return new Map();
    const rows: { id: number; userId: number }[] =
      await this.client.teacher.findMany({
        where: {
          instituteId: this.getInstituteId(),
          id: { in: teacherIds },
          isActive: true,
          deletedAt: null,
          user: activeUser,
        },
        select: { id: true, userId: true },
      });
    return new Map(rows.map((r) => [r.id, r.userId]));
  }

  /** Teachers assigned to subjects of the sections (or every active teacher of the branch / institute). */
  async teacherIdsIn(scope: { branchId?: number; sectionIds?: number[] }): Promise<number[]> {
    if (scope.sectionIds) {
      const rows: { teacherId: number | null }[] =
        await this.client.sectionSubject.findMany({
          where: { instituteId: this.getInstituteId(), sectionId: { in: scope.sectionIds }, teacherId: { not: null } },
          select: { teacherId: true },
          distinct: ['teacherId'],
        });
      return rows.flatMap((r) => (r.teacherId ? [r.teacherId] : []));
    }
    const rows: { id: number }[] = await this.client.teacher.findMany({
      where: {
        instituteId: this.getInstituteId(),
        isActive: true,
        deletedAt: null,
        ...(scope.branchId && { branchTeachers: { some: { branchId: scope.branchId } } }),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
