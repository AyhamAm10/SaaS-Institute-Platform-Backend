/**
 * Represents the authenticated user extracted from the JWT payload.
 * Attached to the request by the JwtAuthGuard.
 * This is intentionally minimal — only data from the JWT, no DB lookups per request.
 */
export interface AuthenticatedUser {
  id: number;
  instituteId: number;
  role: string;
}
