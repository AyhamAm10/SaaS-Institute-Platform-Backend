import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { AccessTokenPayload, RefreshTokenPayload } from './jwt-token.types';

/**
 * Centralized JWT token service.
 *
 * All token signing, verification, and hashing is done here.
 * Controllers, guards, and services must NOT manually decode or verify JWTs.
 *
 * Access tokens and refresh tokens use DIFFERENT secrets to prevent
 * a compromised access token from being used as a refresh token.
 */
@Injectable()
export class JwtTokenService {
  private readonly accessSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    private readonly configService?: ConfigService,
  ) {
    this.accessSecret =
      this.configService?.get<string>('JWT_ACCESS_SECRET') ??
      process.env['JWT_ACCESS_SECRET'] ??
      'dev-access-secret-do-not-use-in-production';
    this.accessExpiresIn =
      this.configService?.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      process.env['JWT_ACCESS_EXPIRES_IN'] ??
      '15m';
    this.refreshSecret =
      this.configService?.get<string>('JWT_REFRESH_SECRET') ??
      process.env['JWT_REFRESH_SECRET'] ??
      'dev-refresh-secret-do-not-use-in-production';
    this.refreshExpiresIn =
      this.configService?.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      process.env['JWT_REFRESH_EXPIRES_IN'] ??
      '7d';
  }

  generateAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(
      { ...payload },
      {
        secret: this.accessSecret,
        expiresIn: this.accessExpiresIn as any,
      },
    );
  }

  generateRefreshToken(payload: RefreshTokenPayload): string {
    return this.jwtService.sign(
      { ...payload },
      {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn as any,
      },
    );
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token, {
      secret: this.accessSecret,
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwtService.verify<RefreshTokenPayload>(token, {
      secret: this.refreshSecret,
    });
  }

  /**
   * Hash a token using SHA-256.
   * Refresh tokens are high-entropy JWTs, so SHA-256 is sufficient
   * for lookup-based comparison (no need for bcrypt's slow hashing).
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
