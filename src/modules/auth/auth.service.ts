import { Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { UserSystemRepository } from '../users/user-system.repository';
import { JwtTokenService } from './jwt-token.service';
import { RedisService } from '../../database/redis.service';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  AuthResponse,
  TokenResponse,
  SafeUser,
  UserProfile,
} from './dto/auth-response.dto';

/** Refresh token TTL: 7 days in seconds */
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

/**
 * Authentication business logic.
 *
 * Owns the login/logout/refresh/profile flows.
 * Uses UserSystemRepository (cross-tenant) because auth operations
 * happen before tenant context is established.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly userSystemRepository: UserSystemRepository,
    private readonly jwtTokenService: JwtTokenService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Authenticate a user with phone + password.
   *
   * Flow:
   *   1. Find user by phone (cross-tenant lookup)
   *   2. Verify password with bcrypt
   *   3. Generate access + refresh tokens
   *   4. Persist refresh token hash in Redis
   *   5. Return tokens + sanitized user
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    // 1. Find user
    const user = await this.userSystemRepository.findByPhone(dto.phone);
    Ensure.exists(user, 'User');

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    Ensure.unauthorized(
      !isPasswordValid,
      ErrorMessages.get('invalid_credentials'),
    );

    // 3. Generate tokens
    const tokens = this.generateTokenPair(user);

    // 4. Persist refresh token hash
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    // 5. Return response (never expose passwordHash)
    return {
      ...tokens,
      user: this.toSafeUser(user),
    };
  }

  /**
   * Revoke the user's refresh token.
   */
  async logout(userId: number): Promise<void> {
    await this.redisService.del(this.refreshTokenKey(userId));
  }

  /**
   * Issue new tokens using a valid refresh token.
   *
   * Flow:
   *   1. Verify refresh token JWT signature + expiry
   *   2. Compare hash with stored hash in Redis (revocation check)
   *   3. Verify user still exists
   *   4. Generate new token pair (rotation)
   *   5. Persist new refresh token hash
   */
  async refresh(dto: RefreshTokenDto): Promise<TokenResponse> {
    // 1. Verify JWT
    let payload;
    try {
      payload = this.jwtTokenService.verifyRefreshToken(dto.refreshToken);
    } catch {
      throw new UnauthorizedException(ErrorMessages.get('token_invalid'));
    }

    // 2. Verify stored hash (checks for revocation)
    const storedHash = await this.redisService.get(
      this.refreshTokenKey(payload.sub),
    );
    const currentHash = this.jwtTokenService.hashToken(dto.refreshToken);

    Ensure.unauthorized(
      !storedHash || storedHash !== currentHash,
      ErrorMessages.get('token_invalid'),
    );

    // 3. Verify user still exists
    const user = await this.userSystemRepository.findById(payload.sub);
    Ensure.unauthorized(!user, ErrorMessages.get('token_invalid'));
    // TypeScript now knows user is non-null (but Ensure.unauthorized
    // doesn't narrow, so we use a non-null assertion after the check)
    const validUser = user!;

    // 4 & 5. Rotate tokens
    const tokens = this.generateTokenPair(validUser);
    await this.persistRefreshToken(validUser.id, tokens.refreshToken);

    return tokens;
  }

  /**
   * Get the authenticated user's full profile with institute details.
   */
  async getProfile(userId: number): Promise<UserProfile> {
    const user = await this.userSystemRepository.findByIdWithInstitute(userId);
    Ensure.exists(user, 'User');

    const { passwordHash, ...safeUser } = user;
    return safeUser as UserProfile;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private generateTokenPair(user: User): TokenResponse {
    const accessToken = this.jwtTokenService.generateAccessToken({
      sub: user.id,
      instituteId: user.instituteId,
      role: user.role,
    });

    const refreshToken = this.jwtTokenService.generateRefreshToken({
      sub: user.id,
    });

    return { accessToken, refreshToken };
  }

  private async persistRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    const hash = this.jwtTokenService.hashToken(refreshToken);
    await this.redisService.set(
      this.refreshTokenKey(userId),
      hash,
      REFRESH_TOKEN_TTL,
    );
  }

  private refreshTokenKey(userId: number): string {
    return `refresh_token:${userId}`;
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      instituteId: user.instituteId,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
