import { Inject, Injectable } from '@nestjs/common';
import { Institute } from '@prisma/client';
import { SystemRepository } from '../../database/system.repository';
import { PrismaService } from '../../database/prisma.service';

/**
 * System-level repository for Institute entities.
 *
 * Institutes represent root tenants and are managed across the system by Super Admins.
 */
@Injectable()
export class InstituteRepository extends SystemRepository<Institute> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'institute');
  }

  /**
   * Create an InstituteAdmin link between an institute and an admin user.
   * Respects active transaction context via `this.client`.
   */
  /** Ids of every institute (scheduled job dispatchers). */
  async findAllIds(): Promise<number[]> {
    const rows = await this.findMany({ orderBy: { id: 'asc' } });
    return rows.map((row) => row.id);
  }

  /** Find an institute by its (global, unique) login code. */
  async findByCode(code: string): Promise<Institute | null> {
    return this.findOne({ code });
  }

  async createAdminLink(instituteId: number, userId: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).instituteAdmin.create({
      data: { instituteId, userId },
    });
  }

  /**
   * Find an institute by ID including its administrators.
   */
  async findByIdWithAdmins(id: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).institute.findUnique({
      where: { id },
      include: {
        instituteAdmins: {
          include: {
            user: true,
          },
        },
      },
    });
  }
}
