import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClientApp, Notification, Prisma, PushPlatform } from '@prisma/client';
import { RequestContext } from '../../context/request-context';
import { tenantJobData } from '../../infrastructure/queue/tenant-job';
import { JobNames, QueueNames } from '../../infrastructure/queue/queue-names';
import { NotificationRepository } from './notification.repository';
import { DeviceTokenRepository } from './device-token.repository';
import { NotificationSettingRepository } from './notification-setting.repository';
import {
  CATEGORY_OF,
  NOTIFICATION_CATEGORIES,
  NotificationCategory,
  NotifyInput,
  PATH_OF,
} from './notification.types';

/**
 * The single entry point to notify people: stores one inbox row per user
 * (skipping users who turned the category off and rows already sent with the
 * same dedupe key) and queues the push. Never throws to the caller: a failed
 * notification must not break the action that triggered it.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
    @Inject(DeviceTokenRepository) private readonly devices: DeviceTokenRepository,
    @Inject(NotificationSettingRepository) private readonly settings: NotificationSettingRepository,
    @InjectQueue(QueueNames.notifications) private readonly queue: Queue,
  ) {}

  async notify(input: NotifyInput): Promise<Notification[]> {
    try {
      const userIds = [...new Set(input.userIds)];
      if (userIds.length === 0) return [];
      const category = CATEGORY_OF[input.type];
      const disabled = await this.settings.disabledForUsers(userIds);
      const recipients = userIds.filter((id) => !(disabled.get(id) ?? []).includes(category));
      const data: Prisma.InputJsonValue = {
        type: input.type,
        path: PATH_OF[input.type],
        ...(input.studentId && { studentId: input.studentId }),
        ...input.extra,
      };
      const created = await this.notifications.createIfNew(
        recipients.map((userId) => ({
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data,
          studentId: input.studentId ?? null,
          dedupeKey: input.dedupeKey ?? null,
        })),
      );
      if (created.length > 0) {
        await this.queue.add(
          JobNames.sendPush,
          tenantJobData({ notificationIds: created.map((n) => n.id) }),
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 500 },
        );
      }
      return created;
    } catch (err: unknown) {
      this.logger.error(`notify ${input.type} failed: ${String(err)}`);
      return [];
    }
  }

  // ── Inbox of the signed-in user ─────────────────────────────────────────

  async inbox(page: number, limit: number) {
    const userId = RequestContext.getUserId();
    const { data, total, unread } = await this.notifications.findPage(userId, (page - 1) * limit, limit);
    return {
      data: data.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        studentId: n.studentId,
        read: n.readAt !== null,
        createdAt: n.createdAt,
      })),
      total,
      unread,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async unreadCount(): Promise<{ unread: number }> {
    return { unread: await this.notifications.countUnread(RequestContext.getUserId()) };
  }

  async markRead(id?: number): Promise<{ updated: number }> {
    return { updated: await this.notifications.markRead(RequestContext.getUserId(), id) };
  }

  // ── Devices and settings ────────────────────────────────────────────────

  async registerDevice(token: string, platform: PushPlatform, app: ClientApp): Promise<{ registered: true }> {
    await this.devices.upsert({ userId: RequestContext.getUserId(), token, platform, app });
    return { registered: true };
  }

  async removeDevice(token: string): Promise<{ removed: number }> {
    return { removed: await this.devices.removeForUser(RequestContext.getUserId(), token) };
  }

  async getSettings() {
    const disabled = await this.settings.disabledFor(RequestContext.getUserId());
    return {
      categories: NOTIFICATION_CATEGORIES.map((key) => ({ key, enabled: !disabled.includes(key) })),
    };
  }

  async saveSettings(disabledCategories: NotificationCategory[]) {
    const clean = NOTIFICATION_CATEGORIES.filter((c) => disabledCategories.includes(c));
    await this.settings.save(RequestContext.getUserId(), clean);
    return this.getSettings();
  }
}
