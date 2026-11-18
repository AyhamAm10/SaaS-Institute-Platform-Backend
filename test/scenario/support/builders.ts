import type { ScenarioApp } from './app';
import { Api, uniquePhone } from './client';

/** Password every account gets after the forced first change in scenarios. */
export const CHANGED_PASSWORD = 'Scenario#2026';
const DEFAULT_PASSWORD = '12345678';

interface LoginResponse {
  accessToken: string;
  user: { id: number; role: string; mustChangePassword: boolean };
}

/** Signs a user in; a default-password account changes it first, like a real first sign-in. */
export async function signIn(s: ScenarioApp, phone: string, password = DEFAULT_PASSWORD): Promise<Api> {
  const anonymous = new Api(s.app);
  const res = await anonymous.post<LoginResponse>('/auth/login', { phone, password });
  let finalPassword = password;
  let token = res.accessToken;
  if (res.user.mustChangePassword) {
    const changed = await new Api(s.app, res.accessToken).post<LoginResponse>('/auth/change-password', {
      currentPassword: password,
      newPassword: CHANGED_PASSWORD,
    });
    finalPassword = CHANGED_PASSWORD;
    token = changed.accessToken;
  }
  const relogin = async () =>
    (await anonymous.post<LoginResponse>('/auth/login', { phone, password: finalPassword })).accessToken;
  return new Api(s.app, token, {}, relogin);
}

/** The platform owner (SUPER_ADMIN of the test database). */
export function signInPlatform(s: ScenarioApp): Promise<Api> {
  return signIn(s, process.env['SUPER_ADMIN_NUMBER']!, process.env['SUPER_ADMIN_PASSWORD']!);
}

export interface StudentInput {
  fullName: string;
  gender?: 'MALE' | 'FEMALE';
  birthDate?: string;
  sectionId?: number;
  familyId?: number;
  newFamily?: { familyName: string; fatherName?: string; motherName?: string; phone?: string };
}

/**
 * One institute of a scenario file, built through the public API. Each file creates
 * its own institutes, so files are isolated by tenant and can run in parallel.
 */
export class InstituteFixture {
  private constructor(
    readonly s: ScenarioApp,
    readonly id: number,
    readonly admin: Api,
    readonly adminPhone: string,
    readonly branchId: number,
    readonly yearId: number,
  ) {}

  static async create(s: ScenarioApp, label: string, year = { name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30' }) {
    const platform = await signInPlatform(s);
    const adminPhone = uniquePhone();
    const created = await platform.post('/institutes', {
      name: `معهد ${label}`,
      timezone: 'Asia/Damascus',
      phone: '0113334455',
      address: 'دمشق - المزة',
      adminFullName: `مدير ${label}`,
      adminPhone,
      adminPassword: CHANGED_PASSWORD,
    });
    const id: number = created.id ?? created.institute?.id;
    const admin = await signIn(s, adminPhone, CHANGED_PASSWORD);
    const branches = await admin.get('/branches');
    const branchId: number = (branches.data ?? branches)[0].id;
    const yearRow = await admin.post('/academic-years', { ...year, isCurrent: true });
    return new InstituteFixture(s, id, admin, adminPhone, branchId, yearRow.id);
  }

  async academicBranch(name: string): Promise<number> {
    return (await this.admin.post('/academic-branches', { name })).id;
  }

  async subject(name: string): Promise<number> {
    return (await this.admin.post('/subjects', { name })).id;
  }

  async section(input: {
    name: string; academicBranchId: number; fee?: number; currency?: 'SYP' | 'USD'; branchId?: number;
  }): Promise<number> {
    const row = await this.admin.post('/sections', {
      name: input.name,
      academicBranchId: input.academicBranchId,
      feeAmount: input.fee ?? 0,
      feeCurrency: input.currency ?? 'SYP',
      branchId: input.branchId ?? this.branchId,
      academicYearId: this.yearId,
    });
    return row.id;
  }

  /** A second (third...) branch of the institute. */
  async branch(name: string): Promise<number> {
    return (await this.admin.post('/branches', { name })).id;
  }

  /** The first default academic branch ("الصف التاسع"), handy when the name does not matter. */
  async anyAcademicBranch(): Promise<number> {
    const row = await this.s.prisma.academicBranch.findFirstOrThrow({ where: { instituteId: this.id }, orderBy: { id: 'asc' } });
    return row.id;
  }

  /** The student's ACTIVE enrollment id (the anchor of the financial contract). */
  async enrollmentOf(studentId: number): Promise<number> {
    const row = await this.s.prisma.studentEnrollment.findFirstOrThrow({ where: { studentId, status: 'ACTIVE' } });
    return row.id;
  }

  /** Registers a student (and, with `newFamily`, the family in the same request). */
  async student(input: StudentInput & { branchId?: number }): Promise<{ id: number; familyId: number }> {
    const row = await this.admin.post('/students', {
      fullName: input.fullName,
      birthDate: input.birthDate ?? '2011-03-14',
      gender: input.gender ?? 'MALE',
      branchId: input.branchId ?? this.branchId,
      ...(input.sectionId && { sectionId: input.sectionId }),
      ...(input.familyId ? { familyId: input.familyId } : { newFamily: input.newFamily }),
    });
    return { id: row.id, familyId: row.familyId ?? row.family?.id };
  }
}
