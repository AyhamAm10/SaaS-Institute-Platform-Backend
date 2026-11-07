import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitStore } from './rate-limit.store';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * Rate limiting (Redis-backed, shared across app instances).
 * Must be imported BEFORE AuthModule so its global guard runs first and
 * throttles requests before authentication work (e.g. bcrypt on login).
 */
@Module({
  providers: [RateLimitStore, { provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class RateLimitModule {}
