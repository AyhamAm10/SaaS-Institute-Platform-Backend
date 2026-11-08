import { Inject, Injectable } from '@nestjs/common';
import { GuardianRelationship, Prisma, User } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { createPaginatedResult } from '../../common/pagination/paginated-result';
import { MobileAccountQueryDto } from './dto/mobile-account-query.dto';
import {
  EligibleStudentItem,
  MobileAccountItem,
} from './dto/mobile-account-response.dto';

const MOBILE_ROLES = ['FAMILY', 'STUDENT'] as const;

type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    familyUsers: {
      include: {
        family: { select: { id: true; familyName: true } };
      };
    };
    student: { select: { id: true; fullName: true } };
  };
}>;

type StudentWithFamily = Prisma.StudentGetPayload<{
  include: {
    family: { select: { id: true; familyName: true; phone: true } };
  };
}>;

@Injectable()
export class MobileAccountsRepository extends TenantAwareRepository<User> {
  protected override readonly softDelete = true;
  protected override readonly softDeleteReleaseFields = ['phone'];
  protected override readonly audited = true;
  protected override readonly actorColumns = false;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'user');
  }

  async findAccounts(query: MobileAccountQueryDto) {
    const instituteId = this.getInstituteId();
    const roleFilter = query.role ? query.role : { in: [...MOBILE_ROLES] };

    const where: Prisma.UserWhereInput = {
      instituteId,
      role: roleFilter,
      ...(query.search?.trim() && {
        OR: [
          { fullName: { contains: query.search.trim(), mode: 'insensitive' } },
          { phone: { contains: query.search.trim() } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.client.user.findMany({
        where,
        include: {
          familyUsers: {
            include: {
              family: {
                select: { id: true, familyName: true },
              },
            },
          },
          student: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { fullName: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.client.user.count({ where }),
    ]);

    const data: MobileAccountItem[] = (users as UserWithRelations[]).map(
      (u: UserWithRelations) => {
      const familyUser = u.familyUsers[0];
      const cleanPhone = u.phone.replace(/__deleted_\d+$/, '');
      return {
        id: u.id,
        fullName: u.fullName,
        phone: cleanPhone,
        role: u.role as 'FAMILY' | 'STUDENT',
        status: u.deletedAt ? 'DEACTIVATED' : 'ACTIVE',
        createdAt: u.createdAt,
        familyId: familyUser?.familyId ?? null,
        familyName: familyUser?.family?.familyName ?? null,
        relationship: familyUser?.relationship ?? null,
        studentId: u.student?.id ?? null,
        studentName: u.student?.fullName ?? null,
      };
    });

    return createPaginatedResult(data, total, query.page, query.limit);
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.findOne({ phone });
  }

  async findMobileUserById(id: number): Promise<User | null> {
    return this.client.user.findFirst({
      where: {
        id,
        instituteId: this.getInstituteId(),
        role: { in: [...MOBILE_ROLES] },
      },
    });
  }

  async getAccountById(id: number): Promise<MobileAccountItem | null> {
    const instituteId = this.getInstituteId();
    const user = await this.client.user.findFirst({
      where: { id, instituteId, role: { in: [...MOBILE_ROLES] } },
      include: {
        familyUsers: {
          include: {
            family: { select: { id: true, familyName: true } },
          },
        },
        student: { select: { id: true, fullName: true } },
      },
    });
    if (!user) return null;
    const familyUser = user.familyUsers[0];
    const cleanPhone = user.phone.replace(/__deleted_\d+$/, '');
    return {
      id: user.id,
      fullName: user.fullName,
      phone: cleanPhone,
      role: user.role as 'FAMILY' | 'STUDENT',
      status: user.deletedAt ? 'DEACTIVATED' : 'ACTIVE',
      createdAt: user.createdAt,
      familyId: familyUser?.familyId ?? null,
      familyName: familyUser?.family?.familyName ?? null,
      relationship: familyUser?.relationship ?? null,
      studentId: user.student?.id ?? null,
      studentName: user.student?.fullName ?? null,
    };
  }

  async createGuardianAccount(data: {
    fullName: string;
    phone: string;
    passwordHash: string;
    familyId: number;
    relationship: GuardianRelationship;
  }): Promise<number> {
    const instituteId = this.getInstituteId();
    const user = await this.client.user.create({
      data: {
        instituteId,
        fullName: data.fullName,
        phone: data.phone,
        passwordHash: data.passwordHash,
        role: 'FAMILY',
      },
    });

    await this.client.familyUser.create({
      data: {
        instituteId,
        familyId: data.familyId,
        userId: user.id,
        relationship: data.relationship,
      },
    });

    return user.id;
  }

  async createStudentAccount(data: {
    fullName: string;
    phone: string;
    passwordHash: string;
    studentId: number;
  }): Promise<number> {
    const instituteId = this.getInstituteId();
    const user = await this.client.user.create({
      data: {
        instituteId,
        fullName: data.fullName,
        phone: data.phone,
        passwordHash: data.passwordHash,
        role: 'STUDENT',
      },
    });

    await this.client.student.update({
      where: { id: data.studentId },
      data: { userId: user.id },
    });

    return user.id;
  }

  async findStudentsWithoutAccount(
    search?: string,
  ): Promise<EligibleStudentItem[]> {
    const instituteId = this.getInstituteId();
    const students = await this.client.student.findMany({
      where: {
        instituteId,
        userId: null,
        deletedAt: null,
        ...(search?.trim() && {
          fullName: { contains: search.trim(), mode: 'insensitive' },
        }),
      },
      include: {
        family: {
          select: { id: true, familyName: true, phone: true },
        },
      },
      take: 20,
      orderBy: { fullName: 'asc' },
    });

    return (students as StudentWithFamily[]).map((s: StudentWithFamily) => ({
      id: s.id,
      fullName: s.fullName,
      familyId: s.family.id,
      familyName: s.family.familyName,
      suggestedPhone: s.family.phone,
    }));
  }
}
