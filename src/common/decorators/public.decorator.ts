import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public — bypasses the global JWT authentication guard.
 * Use on endpoints that should be accessible without a valid access token
 * (e.g., login, refresh).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
