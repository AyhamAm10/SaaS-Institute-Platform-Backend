/**
 * Response type for Section details view in the Admin Dashboard.
 */
export interface SectionBranchSummary {
  id: number;
  name: string;
  code: string;
  address: string;
}

export interface SectionAcademicYearSummary {
  id: number;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
}

export interface SectionDetailsCounts {
  studentEnrollments: number;
  sectionSubjects: number;
  sectionTeachers: number;
  timetables: number;
}

export interface SectionDetailsResponse {
  id: number;
  instituteId: number;
  branchId: number;
  academicYearId: number;
  name: string;
  grade: string;
  feeAmount: number;
  createdAt: Date;
  updatedAt: Date;
  branch: SectionBranchSummary;
  academicYear: SectionAcademicYearSummary;
  _count: SectionDetailsCounts;
}
