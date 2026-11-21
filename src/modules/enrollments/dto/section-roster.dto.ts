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
  /** The yearly data of this enrollment (situation, origin, exam candidacy). */
  details: EnrollmentDetails;
  /** True when no subset was chosen (the student takes every section subject). */
  takesAllSubjects: boolean;
  subjects: { id: number; name: string }[];
}

export interface EnrollmentDetails {
  situation: { id: number; name: string } | null;
  previousSchool: string | null;
  transferredFrom: string | null;
  isExamCandidate: boolean;
  examLanguage: { id: number; name: string } | null;
  candidateNumber: string | null;
  certificate: {
    name: string | null;
    number: string | null;
    /** YYYY-MM-DD */
    date: string | null;
    source: string | null;
    grade: string | null;
  };
}
