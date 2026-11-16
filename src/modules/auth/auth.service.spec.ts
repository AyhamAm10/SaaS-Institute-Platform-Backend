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
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockUser.passwordHash = await bcrypt.hash('Password123!', 10);

    userSystemRepo = {
      findLoginCandidates: jest.fn(),
      findById: jest.fn(),
      findByIdWithInstitute: jest.fn(),
      isInactiveTeacher: jest.fn().mockResolvedValue(false),
      setPassword: jest.fn(),
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

  describe('account state', () => {
    it('refuses a deactivated account, but only after the password matched', async () => {
      const off = { ...mockUser, isActive: false };
      userSystemRepo.findLoginCandidates.mockResolvedValue([off] as any);

      await expect(
        authService.login({ phone: off.phone, password: 'Password123!' }),
      ).rejects.toThrow('deactivated');
      // a wrong password reveals nothing about the state
      await expect(
        authService.login({ phone: off.phone, password: 'nope-nope' }),
      ).rejects.not.toThrow('deactivated');
      expect(jwtTokenService.generateAccessToken).not.toHaveBeenCalled();
    });

    it('marks the token and the user while the default password is in use', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([
        { ...mockUser, mustChangePassword: true },
      ] as any);

      const result = await authService.login({
        phone: mockUser.phone,
        password: 'Password123!',
      });

      expect(jwtTokenService.generateAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ mcp: true }),
      );
      expect(result.user.mustChangePassword).toBe(true);
    });

    it('does not mark the token once the password was changed', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([mockUser] as any);
      await authService.login({ phone: mockUser.phone, password: 'Password123!' });
      expect(jwtTokenService.generateAccessToken).toHaveBeenCalledWith({
        sub: 1,
        instituteId: 10,
        role: 'INSTITUTE_ADMIN',
      });
    });
  });

  describe('changePassword', () => {
    const forced = () => ({ ...mockUser, mustChangePassword: true });

    it('sets the new password, revokes every session and issues fresh tokens', async () => {
      userSystemRepo.findByIdWithInstitute.mockResolvedValue(forced() as any);
      userSystemRepo.setPassword.mockResolvedValue({
        ...mockUser,
        mustChangePassword: false,
      } as any);

      const result = await authService.changePassword(1, {
        currentPassword: 'Password123!',
        newPassword: 'brand-new-pass',
      });

      expect(userSystemRepo.setPassword).toHaveBeenCalledWith(
        1,
        expect.not.stringContaining('brand-new-pass'),
      );
      expect(prismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.user.mustChangePassword).toBe(false);
    });

    it('refuses a wrong current password', async () => {
      userSystemRepo.findByIdWithInstitute.mockResolvedValue(forced() as any);
      await expect(
        authService.changePassword(1, {
          currentPassword: 'wrong-wrong',
          newPassword: 'brand-new-pass',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(userSystemRepo.setPassword).not.toHaveBeenCalled();
    });

    it('refuses the default password as the new one', async () => {
      userSystemRepo.findByIdWithInstitute.mockResolvedValue(forced() as any);
      await expect(
        authService.changePassword(1, {
          currentPassword: 'Password123!',
          newPassword: '12345678',
        }),
      ).rejects.toThrow(HttpException);
      expect(userSystemRepo.setPassword).not.toHaveBeenCalled();
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

  describe('deactivated teachers', () => {
    const makeTeacher = () => ({ ...mockUser, id: 7, role: 'TEACHER' });

    it('refuses to sign in a teacher whose account is deactivated', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([makeTeacher()] as any);
      userSystemRepo.isInactiveTeacher.mockResolvedValue(true as never);
      await expect(
        authService.login({ phone: '+966500000001', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(userSystemRepo.isInactiveTeacher).toHaveBeenCalledWith(7);
      expect(prismaService.refreshToken.create).not.toHaveBeenCalled();
    });

    it('still signs in an active teacher', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([makeTeacher()] as any);
      const result = await authService.login({
        phone: '+966500000001',
        password: 'Password123!',
      });
      expect(result.accessToken).toBe('mock-access-token');
    });

    it('does not even look up the flag for other roles', async () => {
      userSystemRepo.findLoginCandidates.mockResolvedValue([mockUser] as any);
      await authService.login({ phone: '+966500000001', password: 'Password123!' });
      expect(userSystemRepo.isInactiveTeacher).not.toHaveBeenCalled();
    });

    it('refuses to refresh the session of a deactivated teacher', async () => {
      prismaService.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        tokenHash: 'mock-hash-sha256',
        expiresAt: new Date(Date.now() + 60_000),
      } as never);
      userSystemRepo.findByIdWithInstitute.mockResolvedValue(makeTeacher() as any);
      userSystemRepo.isInactiveTeacher.mockResolvedValue(true as never);
      await expect(
        authService.refresh({ refreshToken: 'mock-refresh-token' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prismaService.refreshToken.delete).not.toHaveBeenCalled();
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
