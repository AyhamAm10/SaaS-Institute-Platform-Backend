import { Institute } from '@prisma/client';

/** Response from login and refresh endpoints. */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

/** Response from token refresh (no user data needed). */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

/** User data without sensitive fields. */
export interface SafeUser {
  id: number;
  instituteId: number;
  fullName: string;
  phone: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

/** User profile with institute details. */
export interface UserProfile extends SafeUser {
  institute: Institute;
}

/** Response from web login (tokens stored in HttpOnly cookies). */
export interface WebAuthResponse {
  user: SafeUser;
}

/** Response from web token refresh (tokens stored in HttpOnly cookies). */
export interface WebRefreshResponse {
  message: string;
}

