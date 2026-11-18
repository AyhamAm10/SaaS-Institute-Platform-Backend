import { Inject } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ClientApp, DeviceToken, Notification } from '@prisma/client';
import { TenantJobProcessor } from '../../infrastructure/queue/tenant-job.processor';
import { TenantJobData } from '../../infrastructure/queue/tenant-job';
import { JobNames, QueueNames } from '../../infrastructure/queue/queue-names';
import { NotificationRepository } from './notification.repository';
import { DeviceTokenRepository } from './device-token.repository';
import { PushSenderService, PushTarget } from './push-sender.service';
import { NotificationRemindersService } from './notification-reminders.service';

type PushJob = { notificationIds?: number[] };

/** Where each app's installed web version lives (links of web pushes). */
const WEB_APP_URL: Record<ClientApp, string> = {
  PARENTS: process.env['WEB_APP_PARENTS_URL'] ?? 'https://jilapi.ayhamashram.me/parents',
  TEACHER: process.env['WEB_APP_TEACHER_URL'] ?? 'https://jilapi.ayhamashram.me/teacher',
};

/** Builds the push of one inbox row: app link and string-only data. */
export function pushOf(n: Notification, device: Pick<DeviceToken, 'token' | 'app' | 'platform'>) {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const path = typeof data['path'] === 'string' ? (data['path'] as string) : '/notifications';
  const query = n.studentId ? `?studentId=${n.studentId}` : '';
  const target: PushTarget = {
    token: device.token,
    ...(device.platform === 'WEB' && {
      webLink: `${WEB_APP_URL[device.app]}${path}${query}`,
      webIcon: `${WEB_APP_URL[device.app]}/icon-192.png`,
    }),
  };
  const payload: Record<string, string> = { notificationId: String(n.id), type: n.type, path };
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) payload[key] = String(value);
  }
  return { target, payload };
}

/**
 * Notification jobs of one institute: send the push of stored inbox rows to
 * the users' devices (dead tokens are removed), and the hourly reminders.
 */
@Processor(QueueNames.notifications, { autorun: false })
export class NotificationsProcessor extends TenantJobProcessor<PushJob> {
  constructor(
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
    @Inject(DeviceTokenRepository) private readonly devices: DeviceTokenRepository,
    @Inject(PushSenderService) private readonly sender: PushSenderService,
    @Inject(NotificationRemindersService) private readonly reminders: NotificationRemindersService,
  ) {
    super();
  }

  protected async handle(job: Job<PushJob & TenantJobData>): Promise<number> {
    if (job.name === JobNames.sendReminders) return this.reminders.run();
    if (job.name !== JobNames.sendPush) return 0;

    const rows = await this.notifications.findByIds(job.data.notificationIds ?? []);
    const devices = await this.devices.findForUsers([...new Set(rows.map((r) => r.userId))]);
    let sent = 0;
    const dead: string[] = [];
    for (const n of rows) {
      const own = devices.filter((d) => d.userId === n.userId);
      if (own.length === 0) continue;
      // One FCM call per notification: the link may differ per device (app / web)
      for (const d of own) {
        const { target, payload } = pushOf(n, d);
        const result = await this.sender.send({ title: n.title, body: n.body, data: payload }, [target]);
        sent += result.sent;
        dead.push(...result.deadTokens);
      }
    }
    if (dead.length > 0) await this.devices.removeTokens(dead);
    return sent;
  }
}
