import { Inject, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { SystemRepository } from '../../database/system.repository';
import { PrismaService } from '../../database/prisma.service';
import { UserRole } from '../../common/types/user-role.enum';

/**
 * System-level user repository — NO tenant scoping.
 *
 * Used exclusively for operations that legitimately need cross-tenant access:
 *   - Auth login: find user by phone before knowing which institute they belong to
 *   - Token refresh: verify user still exists/is active
 *   - Super-admin user lookups and initialization
 *
 * Normal application code should use UserRepository (tenant-scoped) instead.
 */
@Injectable()
export class UserSystemRepository extends SystemRepository<User> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'user');
  }

  /** Find a user by phone across all institutes. Used for login. */
  async findByPhone(phone: string): Promise<User | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).user.findUnique({ where: { phone } });
  }

  /** Find super admin user by phone and role. */
  async findSuperAdminByPhone(phone: string): Promise<User | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).user.findFirst({
      where: {
        phone,
        role: UserRole.SUPER_ADMIN,
      },
    });
  }

  /** Find a user by ID with their institute data. Used for profile/token refresh. */
  async findByIdWithInstitute(id: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).user.findUnique({
      where: { id },
      include: { institute: true },
    });
  }

  /** Create a Super Admin user. */
  async createSuperAdmin(data: {
    fullName: string;
    phone: string;
    passwordHash: string;
    instituteId: number;
  }): Promise<User> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).user.create({
      data: {
        fullName: data.fullName,
        phone: data.phone,
        passwordHash: data.passwordHash,
        role: UserRole.SUPER_ADMIN,
        instituteId: data.instituteId,
      },
    });
  }

  /** Find any existing institute ID in the database. */
  async findAnyInstituteId(): Promise<number | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = await (this.client as any).institute.findFirst({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return inst ? inst.id : null;
  }

  /** Provision a root system institute if the database is completely empty. */
  async createPlatformInstitute(phone: string): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = await (this.client as any).institute.create({
      data: {
        name: 'منصة المعاهد التعليمية',
        logoUrl: '',
        primaryColor: '#1a73e8',
        secondaryColor: '#34a853',
        phone,
        address: 'Platform Administration',
      },
      select: { id: true },
    });
    return inst.id;
  }
}
