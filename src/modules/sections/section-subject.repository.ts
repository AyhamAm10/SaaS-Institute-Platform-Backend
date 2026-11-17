import { Inject, Injectable } from '@nestjs/common';
import { SectionSubject } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/**
 * Tenant-scoped repository for SectionSubject entities.
 * Scoped automatically to current tenant institute.
 */
@Injectable()
export class SectionSubjectRepository extends TenantAwareRepository<SectionSubject> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'sectionSubject');
  }

  /**
   * Find a section-subject relationship by sectionId and subjectId within the tenant.
   */
  async findBySectionAndSubject(
    sectionId: number,
    subjectId: number,
  ): Promise<SectionSubject | null> {
    return this.findOne({
      sectionId,
      subjectId,
    });
  }

  /**
   * The (section, subject) pairs a teacher is assigned to, with names, optionally
   * only the sections of one academic year. Explicit tenant + teacher filter:
   * it is the teacher's own scope, not the request context's branch / year.
   */
  async findTaughtBy(teacherId: number, academicYearId?: number) {
    return this.findMany({
      where: {
        teacherId,
        section: {
          deletedAt: null,
          ...(academicYearId !== undefined && { academicYearId }),
        },
      },
      include: {
        subject: { select: { id: true, name: true } },
        section: {
          select: {
            id: true,
            name: true,
            grade: true,
            branchId: true,
            academicYearId: true,
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: [{ section: { name: 'asc' } }, { createdAt: 'asc' }],
    }) as unknown as Promise<TaughtRow[]>;
  }

  /**
   * List all subjects assigned to a section including subject and assigned teacher details.
   */
  async findSubjectsBySection(sectionId: number): Promise<SectionSubject[]> {
    return this.findMany({
      where: { sectionId },
      include: {
        subject: true,
        teacher: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Assign a subject to a section within the current tenant.
   */
  async assignSubject(
    sectionId: number,
    subjectId: number,
    weeklyPeriods: number = 1,
    teacherId: number | null = null,
  ): Promise<SectionSubject> {
    return this.create({
      sectionId,
      subjectId,
      weeklyPeriods,
      teacherId: teacherId || null,
    });
  }

  /** Where a subject is taught: sections of the context (branch / year) with their teacher. */
  async findBySubject(subjectId: number) {
    return this.findMany({
      where: { subjectId, section: { deletedAt: null } },
      include: {
        section: {
          select: {
            id: true,
            name: true,
            academicYearId: true,
            branch: { select: { name: true } },
          },
        },
        teacher: { select: { id: true, user: { select: { fullName: true } } } },
      },
      orderBy: { section: { name: 'asc' } },
    }) as unknown as Promise<SubjectPlacementRow[]>;
  }

  /**
   * Update section-subject assignment and quota.
   */
  async updateAssignment(
    id: number,
    data: { weeklyPeriods?: number; teacherId?: number | null },
  ): Promise<SectionSubject> {
    return this.update(id, data);
  }

  /**
   * Remove a subject from a section within the current tenant.
   */
  async removeSubject(sectionId: number, subjectId: number): Promise<void> {
    const existing = await this.findBySectionAndSubject(sectionId, subjectId);
    if (existing) {
      await this.delete(existing.id);
    }
  }
}

/** Row of {@link SectionSubjectRepository.findTaughtBy}. */
export interface TaughtRow {
  sectionId: number;
  subjectId: number;
  weeklyPeriods: number;
  subject: { id: number; name: string };
  section: {
    id: number;
    name: string;
    grade: string | null;
    branchId: number;
    academicYearId: number;
    branch: { name: string } | null;
  };
}

/** Row of {@link SectionSubjectRepository.findBySubject}. */
export interface SubjectPlacementRow {
  sectionId: number;
  weeklyPeriods: number;
  section: {
    id: number;
    name: string;
    academicYearId: number;
    branch: { name: string } | null;
  };
  teacher: { id: number; user: { fullName: string } } | null;
}
