import { jest } from '@jest/globals';
import { AuthService } from './auth.service';
import { UserSystemRepository } from '../users/user-system.repository';
import { JwtTokenService } from './jwt-token.service';
import bcrypt from 'bcryptjs';
import {
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';

describe('AuthService', () => {
  let authService: AuthService;
  let userSystemRepo: jest.Mocked<UserSystemRepository>;
  let jwtTokenService: jest.Mocked<JwtTokenService>;
  let prismaService: any;

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
      findLoginCandidates: jest.fn(),
      findById: jest.fn(),
      findByIdWithInstitute: jest.fn(),
    } as any;

    jwtTokenService = {
      generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
      generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
      verifyRefreshToken: jest.fn().mockReturnValue({ sub: 1 }),
      hashToken: jest.fn().mockReturnValue('mock-hash-sha256'),
    } as any;

    prismaService = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 1 } as never),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({} as never),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 } as never),
      },
    };

    authService = new AuthService(
      userSystemRepo,
      jwtTokenService,
      prismaService,
    );
  });

  describe('login', () => {
    it('successfully logs in with valid credentials and does not expose passwordHash', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([mockUser] as any);

      const result = await authService.login({
        phone: '+966500000001',
        password: 'Password123!',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.id).toBe(1);
      expect(result.user.instituteId).toBe(10);
      expect((result.user as any).passwordHash).toBeUndefined();
      expect(prismaService.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          tokenHash: 'mock-hash-sha256',
          expiresAt: expect.any(Date),
        },
      });
    });

    it('throws UnauthorizedException when user phone does not exist and calls bcrypt.compare once', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([] as any);
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      await expect(
        authService.login({ phone: '+966500000000', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(compareSpy).toHaveBeenCalledTimes(1);
      compareSpy.mockRestore();
    });

    it('throws UnauthorizedException with exact same message when password is wrong', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([mockUser] as any);

      await expect(
        authService.login({
          phone: '+966500000001',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when institute code has no match', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([] as any);

      await expect(
        authService.login({
          phone: '+966500000001',
          password: 'Password123!',
          instituteCode: 'NONEXISTENT',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login with phones shared across institutes', () => {
    it('logs into the only institute whose password matches', async () => {
      const other = {
        ...mockUser,
        id: 2,
        instituteId: 20,
        passwordHash: 'other-hash',
      };
      userSystemRepo.findLoginCandidates.mockResolvedValue([
        other,
        mockUser,
      ] as any);

      const result = await authService.login({
        phone: '+966500000001',
        password: 'Password123!',
      });

      expect(result.user.instituteId).toBe(10);
    });

    it('requires the institute code when the password matches several institutes', async () => {
      const twin = { ...mockUser, id: 2, instituteId: 20 };
      userSystemRepo.findLoginCandidates.mockResolvedValue([
        mockUser,
        twin,
      ] as any);

      await expect(
        authService.login({ phone: '+966500000001', password: 'Password123!' }),
      ).rejects.toThrow(HttpException);
    });

    it('passes the normalized institute code to the lookup', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([mockUser] as any);

      await authService.login({
        phone: '+966500000001',
        password: 'Password123!',
        instituteCode: ' ins0002 ',
      });

      expect(userSystemRepo.findLoginCandidates).toHaveBeenCalledWith(
        '+966500000001',
        'INS0002',
      );
    });
  });

  describe('refresh', () => {
    it('refuses a deactivated (soft-deleted) account', async () => {
      prismaService.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        tokenHash: 'mock-hash-sha256',
        expiresAt: new Date(Date.now() + 60_000),
      } as never);
      // findByIdWithInstitute filters deletedAt: null → no user
      userSystemRepo.findByIdWithInstitute.mockResolvedValue(null as never);

      await expect(
        authService.refresh({ refreshToken: 'mock-refresh-token' }),
      ).rejects.toThrow();
      expect(prismaService.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rotates tokens successfully with valid active refresh token', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      prismaService.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        tokenHash: 'mock-hash-sha256',
        expiresAt: futureDate,
      } as never);
      userSystemRepo.findByIdWithInstitute.mockResolvedValue(mockUser as any);

      const result = await authService.refresh({
        refreshToken: 'mock-refresh-token',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(prismaService.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(prismaService.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          tokenHash: 'mock-hash-sha256',
          expiresAt: expect.any(Date),
        },
      });
    });

    it('rejects refresh when token has been revoked (not in DB)', async () => {
      prismaService.refreshToken.findUnique.mockResolvedValue(null as never);

      await expect(
        authService.refresh({ refreshToken: 'mock-refresh-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects refresh when token has expired in DB', async () => {
      const pastDate = new Date(Date.now() - 1000);
      prismaService.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        tokenHash: 'mock-hash-sha256',
        expiresAt: pastDate,
      } as never);

      await expect(
        authService.refresh({ refreshToken: 'mock-refresh-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects refresh when refresh token is missing', async () => {
      await expect(
        authService.refresh({ refreshToken: undefined }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('deletes all refresh tokens for user from database', async () => {
      await authService.logout(1);
      expect(prismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });
  });

  describe('getProfile', () => {
    it('returns full user profile with institute details without passwordHash', async () => {
      const userWithInstitute = {
        ...mockUser,
        institute: { id: 10, name: 'Al-Noor Academy' },
      };
      userSystemRepo.findByIdWithInstitute.mockResolvedValue(
        userWithInstitute as any,
      );

      const profile = await authService.getProfile(1);
      expect(profile.id).toBe(1);
      expect(profile.institute.name).toBe('Al-Noor Academy');
      expect((profile as any).passwordHash).toBeUndefined();
      expect(profile.permissions).toEqual(
        expect.arrayContaining(['staff.manage', 'marks.enter']),
      );
    });
  });

  describe('mobile roles (FAMILY / STUDENT) log in like everyone else', () => {
    it.each(['FAMILY', 'STUDENT'])('%s logs in with phone + password and gets tokens', async (role) => {
      const user = { ...mockUser, id: 5, role, phone: '0933000001' };
      userSystemRepo.findLoginCandidates.mockResolvedValue([user] as any);

      const result = await authService.login({ phone: user.phone, password: 'Password123!' });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.role).toBe(role);
      expect(jwtTokenService.generateAccessToken).toHaveBeenCalledWith({
        sub: 5,
        instituteId: 10,
        role,
      });
    });

    it('asks for the institute code when the same guardian exists in two institutes', async () => {
      const a = { ...mockUser, id: 5, instituteId: 10, role: 'FAMILY' };
      const b = { ...mockUser, id: 6, instituteId: 11, role: 'FAMILY' };
      userSystemRepo.findLoginCandidates.mockResolvedValue([a, b] as any);

      await expect(
        authService.login({ phone: '0933000001', password: 'Password123!' }),
      ).rejects.toThrow(HttpException);
    });
  });
});
