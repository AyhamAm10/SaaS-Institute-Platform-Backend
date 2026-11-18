import { Inject, Injectable } from '@nestjs/common';
import { ClientApp, DeviceToken, PushPlatform } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/** Push tokens of the users' devices (FCM registration tokens). */
@Injectable()
export class DeviceTokenRepository extends TenantAwareRepository<DeviceToken> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'deviceToken');
  }

  /**
   * Registers a token for the user. A token is unique worldwide: when another
   * account signs in on the same device, the token moves to that account.
   */
  async upsert(input: {
    userId: number;
    token: string;
    platform: PushPlatform;
    app: ClientApp;
  }): Promise<DeviceToken> {
    const instituteId = this.getInstituteId();
    return this.client.deviceToken.upsert({
      where: { token: input.token },
      create: { ...input, instituteId },
      update: { ...input, instituteId },
    }) as Promise<DeviceToken>;
  }

  /** Removes the user's token (sign-out on that device). */
  async removeForUser(userId: number, token: string): Promise<number> {
    const result = await this.client.deviceToken.deleteMany({
      where: this.scopeWhere({ userId, token }),
    });
    return result.count as number;
  }

  async findForUsers(userIds: number[]): Promise<DeviceToken[]> {
    if (userIds.length === 0) return [];
    return this.client.deviceToken.findMany({
      where: this.scopeWhere({ userId: { in: userIds } }),
    }) as Promise<DeviceToken[]>;
  }

  /** Drops tokens FCM reported as no longer valid. */
  async removeTokens(tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const result = await this.client.deviceToken.deleteMany({
      where: { token: { in: tokens } },
    });
    return result.count as number;
  }
}
