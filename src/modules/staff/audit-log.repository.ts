import { Inject, Injectable } from '@nestjs/common';
import { AuditAction, AuditLog } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/** Read side of the audit log (written by the audited repositories). */
@Injectable()
export class AuditLogRepository extends TenantAwareRepository<AuditLog> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'auditLog');
  }

  /** Entries in [gte, lt), newest first. */
  async findBetween(
    gte: Date,
    lt: Date,
    take: number,
  ): Promise<
    {
      userId: number | null;
      entity: string;
      entityId: number;
      action: AuditAction;
      createdAt: Date;
    }[]
  > {
    return this.client.auditLog.findMany({
      where: { instituteId: this.getInstituteId(), createdAt: { gte, lt } },
      select: {
        userId: true,
        entity: true,
        entityId: true,
        action: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
