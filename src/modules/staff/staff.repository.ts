import { Inject, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { createPaginatedResult } from '../../common/pagination/paginated-result';
import { STAFF_ROLES, UserRole } from '../../common/types/user-role.enum';
import { StaffMember, StaffQueryDto } from './dto/staff.dto';

const STAFF_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  role: true,
  createdAt: true,
} as const;

/**
 * Staff accounts: users of the institute with a staff role (admin,
 * registrar, accountant). Soft delete releases the phone; audited in
 * AuditLog (the password hash is redacted; the users table has no actor
 * columns).
 */
@Injectable()
export class StaffRepository extends TenantAwareRepository<User> {
  protected override readonly softDelete = true;
  protected override readonly softDeleteReleaseFields = ['phone'];
  protected override readonly audited = true;
  // users has no createdById / updatedById: audit log only
  protected override readonly actorColumns = false;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'user');
  }

  async findStaff(query: StaffQueryDto) {
    const where: Prisma.UserWhereInput = {
      role: query.role ? query.role : { in: [...STAFF_ROLES] },
      ...(query.search?.trim() && {
        OR: [
          { fullName: { contains: query.search.trim(), mode: 'insensitive' } },
          { phone: { contains: query.search.trim() } },
        ],
      }),
    };
    const scoped = this.scopeWhere(where as Record<string, unknown>);
    const [data, total]: [StaffMember[], number] = await Promise.all([
      this.client.user.findMany({
        where: scoped,
        select: STAFF_SELECT,
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.client.user.count({ where: scoped }),
    ]);
    return createPaginatedResult(data, total, query.page, query.limit);
  }

  /** Staff member by id (null when not staff, deleted or another institute). */
  async findStaffById(id: number): Promise<StaffMember | null> {
    return this.client.user.findFirst({
      where: this.scopeWhere({ id, role: { in: [...STAFF_ROLES] } }),
      select: STAFF_SELECT,
    });
  }

  /** Any active user of the institute with this phone (login uniqueness). */
  async findByPhone(phone: string): Promise<User | null> {
    return this.findOne({ phone });
  }

  async countActiveAdmins(): Promise<number> {
    return this.count({ role: UserRole.INSTITUTE_ADMIN });
  }

  /** Names of any users of the institute (deleted ones included). */
  async findNames(ids: number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map();
    const rows: { id: number; fullName: string }[] =
      await this.client.user.findMany({
        where: { instituteId: this.getInstituteId(), id: { in: ids } },
        select: { id: true, fullName: true },
      });
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  /** Keeps the InstituteAdmin link in sync with the admin role. */
  async syncAdminLink(userId: number, isAdmin: boolean): Promise<void> {
    const instituteId = this.getInstituteId();
    if (isAdmin) {
      await this.client.instituteAdmin.upsert({
        where: { userId },
        create: { instituteId, userId },
        update: {},
      });
    } else {
      await this.client.instituteAdmin.deleteMany({
        where: { instituteId, userId },
      });
    }
  }
}
