import { GuardianRelationship } from '@prisma/client';

export interface MobileAccountItem {
  id: number;
  fullName: string;
  phone: string;
  role: 'FAMILY' | 'STUDENT';
  status: 'ACTIVE' | 'DEACTIVATED';
  createdAt: Date;
  familyId?: number | null;
  familyName?: string | null;
  relationship?: GuardianRelationship | null;
  studentId?: number | null;
  studentName?: string | null;
}

export interface EligibleStudentItem {
  id: number;
  fullName: string;
  familyId: number;
  familyName: string;
  suggestedPhone?: string | null;
}

