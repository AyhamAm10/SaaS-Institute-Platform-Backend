/**
 * Access token payload — embedded in every authenticated request.
 * Contains the minimum data needed for authorization decisions.
 */
export interface AccessTokenPayload {
  /** User ID (JWT standard "subject" claim) */
  sub: number;
  /** The user's institute — used for tenant scoping */
  instituteId: number;
  /** User role for authorization */
  role: string;
}

/**
 * Refresh token payload — used only during token refresh.
 * Intentionally minimal — sensitive data is looked up from the DB during refresh.
 */
export interface RefreshTokenPayload {
  /** User ID (JWT standard "subject" claim) */
  sub: number;
}
