import type { PushMessage, PushTarget } from '../../../src/modules/notifications/push-sender.service';

export interface SentPush {
  message: PushMessage;
  target: PushTarget;
}

/**
 * Stands in for Firebase: records every push instead of sending it.
 * Tokens starting with "dead-" answer like FCM does for an uninstalled app,
 * so the cleanup of dead tokens can be tested.
 */
export class FakePushSender {
  readonly sent: SentPush[] = [];

  get enabled(): boolean {
    return true;
  }

  async send(message: PushMessage, targets: PushTarget[]): Promise<{ sent: number; deadTokens: string[] }> {
    const deadTokens = targets.filter((t) => t.token.startsWith('dead-')).map((t) => t.token);
    for (const target of targets) if (!deadTokens.includes(target.token)) this.sent.push({ message, target });
    return { sent: targets.length - deadTokens.length, deadTokens };
  }

  clear(): void {
    this.sent.length = 0;
  }
}
