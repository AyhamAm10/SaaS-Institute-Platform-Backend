import { Inject, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { createPaginatedResult } from '../../common/pagination/paginated-result';
import { STAFF_ROLES, UserRole } from '../../common/types/user-role.enum';
import {
  AccountItem,
  AccountsQueryDto,
  AccountType,
} from './dto/accounts.dto';

const ROLES_BY_TYPE: Record<AccountType, string[]> = {
  staff: [...STAFF_ROLES],
  teachers: [UserRole.TEACHER],
  families: [UserRole.FAMILY],
  students: [UserRole.STUDENT],
};

const INCLUDE = {
  teacher: { select: { specialization: true } },
  familyUsers: {
    where: { family: { deletedAt: null } },
    include: { family: { select: { familyName: true } } },
  },
  student: { select: { fullName: true } },
} satisfies Prisma.UserInclude;

type AccountRow = Prisma.UserGetPayload<{ include: typeof INCLUDE }>;

/**
 * Every account of the institute, whatever its kind. Unlike the operational
 * reads (login, refresh, staff / teacher pickers) this one shows deactivated
 * accounts too, so they can be switched back on.
 */
@Injectable()
export class AccountsRepository extends TenantAwareRepository<User> {
  protected override readonly softDelete = true;
  protected override readonly audited = true;
  protected override readonly actorColumns = false;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'user');
  }

  async list(query: AccountsQueryDto) {
    const search = query.search?.trim();
    const where = this.scopeWhere({
      role: { in: ROLES_BY_TYPE[query.type] },
      ...(query.status && { isActive: query.status === 'active' }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      }),
    }) as Prisma.UserWhereInput;

    const [rows, total]: [AccountRow[], number] = await Promise.all([
      this.client.user.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.client.user.count({ where }),
    ]);
    return createPaginatedResult(
      rows.map(toItem),
      total,
      query.page,
      query.limit,
    );
  }

  /** The account (any state) of this institute, with its linked records. */
  async findAccount(id: number): Promise<AccountRow | null> {
    return this.client.user.findFirst({
      where: this.scopeWhere({ id }) as Prisma.UserWhereInput,
      include: INCLUDE,
    });
  }

  async findItem(id: number): Promise<AccountItem | null> {
    const row = await this.findAccount(id);
    return row ? toItem(row) : null;
  }

  async countActiveAdmins(): Promise<number> {
    return this.count({ role: UserRole.INSTITUTE_ADMIN, isActive: true });
  }

  /** Switches the login on or off; a teacher record follows its account. */
  async setActive(user: User, isActive: boolean): Promise<void> {
    await this.update(user.id, { isActive });
    if (user.role === UserRole.TEACHER) {
      await this.client.teacher.updateMany({
        where: { instituteId: this.getInstituteId(), userId: user.id },
        data: { isActive },
      });
    }
  }

  /** Students (not deleted) that have no login account yet. */
  async findStudentsWithoutAccount(search?: string) {
    const q = search?.trim();
    const rows = await this.client.student.findMany({
      where: {
        instituteId: this.getInstituteId(),
        userId: null,
        deletedAt: null,
        ...(q && { fullName: { contains: q, mode: 'insensitive' } }),
      },
      select: {
        id: true,
        fullName: true,
        family: { select: { id: true, familyName: true, phone: true } },
      },
      take: 20,
      orderBy: { fullName: 'asc' },
    });
    return rows.map((s: (typeof rows)[number]) => ({
      id: s.id,
      fullName: s.fullName,
      familyId: s.family.id,
      familyName: s.family.familyName,
    }));
  }

  async linkStudent(studentId: number, userId: number): Promise<void> {
    await this.client.student.update({
      where: { id: studentId },
      data: { userId },
    });
  }
}

function toItem(u: AccountRow): AccountItem {
  const families = u.familyUsers.map((f) => f.family.familyName);
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
    linkedTo:
      u.role === UserRole.FAMILY
        ? families.join('، ') || null
        : u.role === UserRole.STUDENT
          ? (u.student?.fullName ?? null)
          : (u.teacher?.specialization ?? null),
  };
}
