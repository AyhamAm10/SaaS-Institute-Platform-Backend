import { Inject, Injectable } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

export interface NewNotificationRow {
  userId: number;
  type: string;
  title: string;
  body: string;
  data: Prisma.InputJsonValue;
  studentId: number | null;
  dedupeKey: string | null;
}

/** The in-app inbox (one row per user and notification). Institute-scoped. */
@Injectable()
export class NotificationRepository extends TenantAwareRepository<Notification> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'notification');
  }

  /**
   * Inserts the rows, skipping the ones whose (user, dedupeKey) already
   * exists, and returns only the rows really created.
   */
  async createIfNew(rows: NewNotificationRow[]): Promise<Notification[]> {
    if (rows.length === 0) return [];
    const instituteId = this.getInstituteId();
    return this.client.notification.createManyAndReturn({
      data: rows.map((r) => ({ ...r, instituteId })),
      skipDuplicates: true,
    }) as Promise<Notification[]>;
  }

  async findPage(userId: number, skip: number, take: number) {
    const where = this.scopeWhere({ userId });
    const [data, total, unread] = await Promise.all([
      this.client.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }) as Promise<Notification[]>,
      this.client.notification.count({ where }) as Promise<number>,
      this.client.notification.count({
        where: { ...where, readAt: null },
      }) as Promise<number>,
    ]);
    return { data, total, unread };
  }

  async countUnread(userId: number): Promise<number> {
    return this.client.notification.count({
      where: this.scopeWhere({ userId, readAt: null }),
    });
  }

  /** Marks one (or all, without `id`) of the user's notifications as read. */
  async markRead(userId: number, id?: number): Promise<number> {
    const result = await this.client.notification.updateMany({
      where: this.scopeWhere({ userId, readAt: null, ...(id && { id }) }),
      data: { readAt: new Date() },
    });
    return result.count as number;
  }

  async findByIds(ids: number[]): Promise<Notification[]> {
    if (ids.length === 0) return [];
    return this.client.notification.findMany({
      where: this.scopeWhere({ id: { in: ids } }),
    }) as Promise<Notification[]>;
  }
}
