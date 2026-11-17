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

  /** Filtered, paged search for the audit viewer (newest first). */
  async search(filter: {
    gte?: Date;
    lt?: Date;
    entity?: string;
    entityId?: number;
    userId?: number;
    action?: AuditAction;
    skip: number;
    take: number;
  }): Promise<{ rows: AuditLog[]; total: number }> {
    const where = {
      instituteId: this.getInstituteId(),
      ...((filter.gte || filter.lt) && {
        createdAt: {
          ...(filter.gte && { gte: filter.gte }),
          ...(filter.lt && { lt: filter.lt }),
        },
      }),
      ...(filter.entity && { entity: filter.entity }),
      ...(filter.entityId && { entityId: filter.entityId }),
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.action && { action: filter.action }),
    };
    const [rows, total] = await Promise.all([
      this.client.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.client.auditLog.count({ where }),
    ]);
    return { rows, total };
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
