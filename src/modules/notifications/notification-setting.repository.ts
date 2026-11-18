import { Inject, Injectable } from '@nestjs/common';
import { NotificationSetting } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/** Categories each user turned off (no row = everything on). */
@Injectable()
export class NotificationSettingRepository extends TenantAwareRepository<NotificationSetting> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'notificationSetting');
  }

  async disabledFor(userId: number): Promise<string[]> {
    const row = await this.client.notificationSetting.findFirst({
      where: this.scopeWhere({ userId }),
    });
    return (row?.disabledCategories as string[] | undefined) ?? [];
  }

  /** userId -> disabled categories, for the users that changed anything. */
  async disabledForUsers(userIds: number[]): Promise<Map<number, string[]>> {
    if (userIds.length === 0) return new Map();
    const rows: NotificationSetting[] =
      await this.client.notificationSetting.findMany({
        where: this.scopeWhere({ userId: { in: userIds } }),
      });
    return new Map(rows.map((r) => [r.userId, r.disabledCategories]));
  }

  async save(userId: number, disabledCategories: string[]): Promise<void> {
    const instituteId = this.getInstituteId();
    await this.client.notificationSetting.upsert({
      where: { userId },
      create: { userId, instituteId, disabledCategories },
      update: { disabledCategories },
    });
  }
}
