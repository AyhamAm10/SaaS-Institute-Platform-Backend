import { EnrollmentStatus } from '@prisma/client';

/** One student row of a section roster. */
export interface SectionRosterItem {
  enrollmentId: number;
  sectionId: number;
  status: EnrollmentStatus;
  statusReason: string | null;
  enrolledAt: Date;
  student: {
    id: number;
    fullName: string;
    gender: string;
    familyName: string | null;
    phone: string | null;
    status: { id: number; name: string; tone: string } | null;
    customFields?: unknown;
  };
  /** True when no subset was chosen (the student takes every section subject). */
  takesAllSubjects: boolean;
  subjects: { id: number; name: string }[];
}
