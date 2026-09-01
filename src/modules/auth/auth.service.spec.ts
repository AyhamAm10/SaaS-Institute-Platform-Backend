import { jest } from '@jest/globals';
import { AuthService } from './auth.service';
import { UserSystemRepository } from '../users/user-system.repository';
import { JwtTokenService } from './jwt-token.service';
import { RedisService } from '../../database/redis.service';
import bcrypt from 'bcryptjs';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';

describe('AuthService', () => {
  let authService: AuthService;
  let userSystemRepo: jest.Mocked<UserSystemRepository>;
  let jwtTokenService: jest.Mocked<JwtTokenService>;
  let redisService: jest.Mocked<RedisService>;

  const mockUser = {
    id: 1,
    instituteId: 10,
    fullName: 'Test Admin',
    phone: '+966500000001',
    passwordHash: '',
    role: 'INSTITUTE_ADMIN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockUser.passwordHash = await bcrypt.hash('Password123!', 10);

    userSystemRepo = {
      findByPhone: jest.fn(),
      findById: jest.fn(),
      findByIdWithInstitute: jest.fn(),
    } as any;

    jwtTokenService = {
      generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
      generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
      verifyRefreshToken: jest.fn().mockReturnValue({ sub: 1 }),
      hashToken: jest.fn().mockReturnValue('mock-hash-sha256'),
    } as any;

    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
    } as any;

    authService = new AuthService(userSystemRepo, jwtTokenService, redisService);
  });

  describe('login', () => {
    it('successfully logs in with valid credentials and does not expose passwordHash', async () => {
      userSystemRepo.findByPhone.mockResolvedValue(mockUser as any);

      const result = await authService.login({
        phone: '+966500000001',
        password: 'Password123!',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.id).toBe(1);
      expect(result.user.instituteId).toBe(10);
      expect((result.user as any).passwordHash).toBeUndefined();
      expect(redisService.set).toHaveBeenCalledWith('refresh_token:1', 'mock-hash-sha256', expect.any(Number));
    });

    it('throws NotFoundException when user phone does not exist', async () => {
      userSystemRepo.findByPhone.mockResolvedValue(null);

      await expect(
        authService.login({ phone: '+966500000000', password: 'Password123!' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      userSystemRepo.findByPhone.mockResolvedValue(mockUser as any);

      await expect(
        authService.login({ phone: '+966500000001', password: 'WrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates tokens successfully with valid active refresh token', async () => {
      redisService.get.mockResolvedValue('mock-hash-sha256');
      userSystemRepo.findById.mockResolvedValue(mockUser as any);

      const result = await authService.refresh({ refreshToken: 'mock-refresh-token' });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(redisService.set).toHaveBeenCalledWith('refresh_token:1', 'mock-hash-sha256', expect.any(Number));
    });

    it('rejects refresh when token has been revoked in Redis', async () => {
      redisService.get.mockResolvedValue(null); // Revoked / expired

      await expect(
        authService.refresh({ refreshToken: 'mock-refresh-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes refresh token from Redis', async () => {
      await authService.logout(1);
      expect(redisService.del).toHaveBeenCalledWith('refresh_token:1');
    });
  });

  describe('getProfile', () => {
    it('returns full user profile with institute details without passwordHash', async () => {
      const userWithInstitute = {
        ...mockUser,
        institute: { id: 10, name: 'Al-Noor Academy' },
      };
      userSystemRepo.findByIdWithInstitute.mockResolvedValue(userWithInstitute as any);

      const profile = await authService.getProfile(1);
      expect(profile.id).toBe(1);
      expect(profile.institute.name).toBe('Al-Noor Academy');
      expect((profile as any).passwordHash).toBeUndefined();
    });
  });
});
