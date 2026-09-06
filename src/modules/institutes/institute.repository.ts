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
