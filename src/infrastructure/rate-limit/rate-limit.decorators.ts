import { SetMetadata } from '@nestjs/common';

export const LOGIN_RATE_LIMIT_FIELD = 'loginRateLimitField';

/**
 * Applies the strict login policy to a route, tracked by client IP AND the
 * given body field (e.g. the phone being guessed). Limits come from config
 * (THROTTLE_LOGIN_LIMIT per THROTTLE_LOGIN_TTL_MS).
 *
 * Usage:
 *   @LoginRateLimit('phone')
 */
export const LoginRateLimit = (bodyField: string) =>
  SetMetadata(LOGIN_RATE_LIMIT_FIELD, bodyField);
