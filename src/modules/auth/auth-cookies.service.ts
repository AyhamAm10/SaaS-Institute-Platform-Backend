import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request, CookieOptions } from 'express';
import { TokenResponse } from './dto/auth-response.dto';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/**
 * Service managing secure HttpOnly cookie delivery for Web clients.
 *
 * Configures:
 * - httpOnly: true (mitigates XSS)
 * - secure: based on COOKIE_SECURE or NODE_ENV === 'production'
 * - sameSite: based on COOKIE_SAME_SITE ('lax' | 'strict' | 'none')
 * - domain: optional based on COOKIE_DOMAIN
 */
@Injectable()
export class AuthCookiesService {
  private readonly logger = new Logger(AuthCookiesService.name);
  private readonly secure: boolean;
  private readonly sameSite: 'lax' | 'strict' | 'none';
  private readonly domain?: string;
  private readonly accessMaxAgeMs: number;
  private readonly refreshMaxAgeMs: number;

  constructor(private readonly configService?: ConfigService) {
    const rawSecure =
      this.configService?.get<string>('COOKIE_SECURE') ??
      process.env['COOKIE_SECURE'];
    this.secure =
      rawSecure !== undefined
        ? rawSecure === 'true'
        : (process.env['NODE_ENV'] === 'production');

    const rawSameSite = (
      this.configService?.get<string>('COOKIE_SAME_SITE') ??
      process.env['COOKIE_SAME_SITE'] ??
      'lax'
    ).toLowerCase();
    this.sameSite =
      rawSameSite === 'strict' || rawSameSite === 'none' ? rawSameSite : 'lax';

    this.domain =
      this.configService?.get<string>('COOKIE_DOMAIN') ??
      process.env['COOKIE_DOMAIN'] ??
      undefined;

    const accessExpiryStr =
      this.configService?.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      process.env['JWT_ACCESS_EXPIRES_IN'] ??
      '15m';
    this.accessMaxAgeMs = this.parseDurationToMs(accessExpiryStr, 15 * 60 * 1000);

    const refreshExpiryStr =
      this.configService?.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      process.env['JWT_REFRESH_EXPIRES_IN'] ??
      '7d';
    this.refreshMaxAgeMs = this.parseDurationToMs(
      refreshExpiryStr,
      7 * 24 * 60 * 60 * 1000,
    );
  }

  /**
   * Set both Access Token and Refresh Token as secure HttpOnly cookies.
   */
  setAuthCookies(res: Response, tokens: TokenResponse): void {
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, this.getAccessCookieOptions());
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, this.getRefreshCookieOptions());
  }

  /**
   * Clear both Access Token and Refresh Token cookies (for logout).
   */
  clearAuthCookies(res: Response): void {
    const clearOptions: CookieOptions = {
      httpOnly: true,
      secure: this.secure,
      sameSite: this.sameSite,
      path: '/',
      ...(this.domain ? { domain: this.domain } : {}),
    };

    res.clearCookie(ACCESS_TOKEN_COOKIE, clearOptions);
    res.clearCookie(REFRESH_TOKEN_COOKIE, clearOptions);
  }

  /**
   * Extract a named cookie value from a request (supporting both req.cookies and raw Cookie header).
   */
  extractCookie(req: Request, name: string): string | undefined {
    if (req.cookies && req.cookies[name]) {
      return req.cookies[name];
    }

    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return undefined;

    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  getAccessCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: this.sameSite,
      maxAge: this.accessMaxAgeMs,
      path: '/',
      ...(this.domain ? { domain: this.domain } : {}),
    };
  }

  getRefreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: this.sameSite,
      maxAge: this.refreshMaxAgeMs,
      path: '/',
      ...(this.domain ? { domain: this.domain } : {}),
    };
  }

  private parseDurationToMs(duration: string, defaultMs: number): number {
    if (!duration) return defaultMs;
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return defaultMs;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return defaultMs;
    }
  }
}
