import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { UserSystemRepository } from '../users/user-system.repository';
import { JwtTokenService } from './jwt-token.service';
import { PrismaService } from '../../database/prisma.service';
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

/** Refresh token TTL: 7 days in milliseconds */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Authentication business logic.
 *
 * Owns the login/logout/refresh/profile flows.
 * Uses UserSystemRepository (cross-tenant) because auth operations
 * happen before tenant context is established.
 *
 * Refresh tokens are persisted in the `refresh_tokens` PostgreSQL table
 * with hash + expiry. No Redis dependency.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(UserSystemRepository)
    private readonly userSystemRepository: UserSystemRepository,
    @Inject(JwtTokenService)
    private readonly jwtTokenService: JwtTokenService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) { }

  /**
   * Authenticate a user with phone + password.
   *
   * Flow:
   *   1. Find user by phone (cross-tenant lookup)
   *   2. Verify password with bcrypt
   *   3. Generate access + refresh tokens
   *   4. Persist refresh token hash in database
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

    // 4. Persist refresh token hash in database
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    // 5. Return response (never expose passwordHash)
    return {
      ...tokens,
      user: this.toSafeUser(user),
    };
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices).
   */
  async logout(userId: number): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  /**
   * Issue new tokens using a valid refresh token.
   *
   * Flow:
   *   1. Verify refresh token JWT signature + expiry
   *   2. Look up hash in database (revocation check + expiry)
   *   3. Verify user still exists
   *   4. Delete old token and persist new one (rotation)
   */
  async refresh(dto: RefreshTokenDto): Promise<TokenResponse> {
    Ensure.unauthorized(!dto.refreshToken, ErrorMessages.get('token_invalid'));
    const refreshToken = dto.refreshToken!;

    // 1. Verify JWT
    let payload;
    try {
      payload = this.jwtTokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException(ErrorMessages.get('token_invalid'));
    }

    // 2. Verify stored hash in database (checks for revocation + expiry)
    const currentHash = this.jwtTokenService.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: currentHash },
    });

    Ensure.unauthorized(
      !storedToken || storedToken.expiresAt < new Date(),
      ErrorMessages.get('token_invalid'),
    );

    // 3. Verify user still exists
    const user = await this.userSystemRepository.findById(payload.sub);
    Ensure.unauthorized(!user, ErrorMessages.get('token_invalid'));
    const validUser = user!;

    // 4. Delete old token and rotate
    await this.prisma.refreshToken.delete({
      where: { id: storedToken!.id },
    });

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

    const { passwordHash: _passwordHash, ...safeUser } = user;
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
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt,
      },
    });
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
