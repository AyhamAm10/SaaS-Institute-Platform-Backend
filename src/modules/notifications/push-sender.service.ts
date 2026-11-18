import { readFileSync } from 'fs';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

export interface PushMessage {
  title: string;
  body: string;
  /** String values only (FCM data payload). */
  data: Record<string, string>;
}

export interface PushTarget {
  token: string;
  /** Absolute URL a web push opens when clicked (the installed web app). */
  webLink?: string;
  /** Absolute icon URL of a web push (each web app has its own icon). */
  webIcon?: string;
}

/** FCM error codes meaning the token will never work again. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Firebase Cloud Messaging (HTTP v1) through the Admin SDK: one sender for
 * Android apps and installed web apps (iPhone uses the web app). Without a
 * service account (local tests) it is disabled and only logs.
 */
@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);
  private messaging: Messaging | null = null;

  constructor(@Optional() @Inject(ConfigService) config?: ConfigService) {
    const path =
      config?.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH') ??
      process.env['FIREBASE_SERVICE_ACCOUNT_PATH'];
    if (!path) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_PATH is not set: push is disabled');
      return;
    }
    try {
      const account = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
      const app: App =
        getApps()[0] ??
        initializeApp({ credential: cert(account), projectId: account['project_id'] });
      this.messaging = getMessaging(app);
    } catch (err: unknown) {
      this.logger.error(`Firebase could not start, push is disabled: ${String(err)}`);
    }
  }

  get enabled(): boolean {
    return this.messaging !== null;
  }

  /**
   * Sends one message to many devices (FCM allows 500 per call). Returns the
   * tokens FCM rejected for good, so the caller can delete them.
   */
  async send(message: PushMessage, targets: PushTarget[]): Promise<{ sent: number; deadTokens: string[] }> {
    if (!this.messaging || targets.length === 0) return { sent: 0, deadTokens: [] };
    const deadTokens: string[] = [];
    let sent = 0;
    for (let i = 0; i < targets.length; i += 500) {
      const batch = targets.slice(i, i + 500);
      const result = await this.messaging.sendEach(
        batch.map((t) => ({
          token: t.token,
          notification: { title: message.title, body: message.body },
          data: message.data,
          android: {
            priority: 'high' as const,
            notification: { channelId: 'default', sound: 'default' },
          },
          webpush: {
            notification: { dir: 'rtl' as const, lang: 'ar', ...(t.webIcon && { icon: t.webIcon }) },
            ...(t.webLink && { fcmOptions: { link: t.webLink } }),
          },
        })),
      );
      result.responses.forEach((r, index) => {
        if (r.success) sent++;
        else if (r.error && DEAD_TOKEN_CODES.has(r.error.code)) deadTokens.push(batch[index].token);
        else if (r.error) this.logger.warn(`push failed: ${r.error.code}`);
      });
    }
    return { sent, deadTokens };
  }
}
