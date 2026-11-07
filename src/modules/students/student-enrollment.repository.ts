import { Inject, Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma, StudentEnrollment } from '@prisma/client';
import { ContextScopedRepository } from '../../database/context-scoped.repository';
import { PrismaService } from '../../database/prisma.service';

/** Student fields shown in a section roster. */
const ROSTER_INCLUDE = {
  student: {
    select: {
      id: true,
      fullName: true,
      gender: true,
      branchId: true,
      family: { select: { id: true, familyName: true, phone: true } },
      status: { select: { id: true, name: true, tone: true } },
    },
  },
  subjects: {
    where: { status: 'ACTIVE' },
    select: { subjectId: true, subject: { select: { id: true, name: true } } },
    orderBy: { subjectId: 'asc' },
  },
} as const;

/**
 * Student enrollments (one per student per academic year).
 * Audited: transfers and status changes are written to `AuditLog`.
 */
@Injectable()
export class StudentEnrollmentRepository extends ContextScopedRepository<StudentEnrollment> {
  protected override readonly yearKey = 'academicYearId';
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'studentEnrollment');
  }

  async findByStudentAndYear(
    studentId: number,
    academicYearId: number,
  ): Promise<StudentEnrollment | null> {
    return this.findOne({ studentId, academicYearId });
  }

  /** Student ids (out of `studentIds`) that already have an enrollment in the year. */
  async findEnrolledStudentIds(
    studentIds: number[],
    academicYearId: number,
  ): Promise<Set<number>> {
    const rows = await this.findMany({
      where: { studentId: { in: studentIds }, academicYearId },
    });
    return new Set(rows.map((row) => row.studentId));
  }

  /** Roster of a section: enrollments with student info and chosen subjects. */
  async findBySection(sectionId: number, academicYearId: number) {
    return this.findMany({
      where: { sectionId, academicYearId, student: { deletedAt: null } },
      include: ROSTER_INCLUDE,
      orderBy: [{ status: 'asc' }, { enrolledAt: 'asc' }],
    }) as unknown as Promise<RosterRow[]>;
  }

  async findRosterRow(
    id: number,
    academicYearId: number,
  ): Promise<RosterRow | null> {
    const rows = (await this.findMany({
      where: { id, academicYearId },
      include: ROSTER_INCLUDE,
    })) as unknown as RosterRow[];
    return rows[0] ?? null;
  }

  /**
   * Active enrollments of a year (optionally one branch) as student → section
   * (dashboard counters). The year is explicit: not scoped by the header.
   */
  async findActiveStudentSections(
    academicYearId: number,
    branchId?: number,
  ): Promise<{ studentId: number; sectionId: number }[]> {
    return this.client.studentEnrollment.findMany({
      where: {
        instituteId: this.getInstituteId(),
        academicYearId,
        status: EnrollmentStatus.ACTIVE,
        student: { deletedAt: null },
        ...(branchId && { section: { branchId } }),
      },
      select: { studentId: true, sectionId: true },
    });
  }

  async enroll(data: {
    studentId: number;
    sectionId: number;
    academicYearId: number;
    status?: EnrollmentStatus;
  }): Promise<StudentEnrollment> {
    return this.create({
      studentId: data.studentId,
      sectionId: data.sectionId,
      academicYearId: data.academicYearId,
      enrolledAt: new Date(),
      status: data.status ?? EnrollmentStatus.ACTIVE,
    });
  }

  /**
   * Enrollments of a year for reports (D3), with the student, family, status,
   * section and whether a contract exists. The year is explicit.
   */
  async findYearForReport(filter: YearEnrollmentFilter) {
    return this.client.studentEnrollment.findMany({
      where: {
        instituteId: this.getInstituteId(),
        academicYearId: filter.academicYearId,
        student: { deletedAt: null },
        ...(filter.activeOnly && { status: EnrollmentStatus.ACTIVE }),
        ...(filter.withoutContract && { subscription: { is: null } }),
        ...(filter.sectionId && { sectionId: filter.sectionId }),
        ...(filter.branchId && { section: { branchId: filter.branchId } }),
      },
      include: YEAR_ENROLLMENT_INCLUDE,
      orderBy: [{ section: { name: 'asc' } }, { student: { fullName: 'asc' } }],
      take: filter.take,
    }) as Promise<YearEnrollmentRow[]>;
  }
}

export interface YearEnrollmentFilter {
  academicYearId: number;
  sectionId?: number;
  branchId?: number;
  activeOnly?: boolean;
  withoutContract?: boolean;
  take: number;
}

const YEAR_ENROLLMENT_INCLUDE = {
  student: {
    select: {
      id: true,
      fullName: true,
      gender: true,
      birthDate: true,
      createdAt: true,
      family: {
        select: {
          familyName: true,
          fatherName: true,
          motherName: true,
          phone: true,
        },
      },
      status: { select: { name: true, tone: true } },
    },
  },
  section: { select: { id: true, name: true } },
  subscription: { select: { id: true } },
} as const;

export type YearEnrollmentRow = Prisma.StudentEnrollmentGetPayload<{
  include: typeof YEAR_ENROLLMENT_INCLUDE;
}>;

export interface RosterRow extends StudentEnrollment {
  student: {
    id: number;
    fullName: string;
    gender: string;
    branchId: number;
    family: { id: number; familyName: string; phone: string | null } | null;
    status: { id: number; name: string; tone: string } | null;
  };
  subjects: { subjectId: number; subject: { id: number; name: string } }[];
}
