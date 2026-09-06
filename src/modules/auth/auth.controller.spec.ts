import { jest } from '@jest/globals';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthCookiesService, REFRESH_TOKEN_COOKIE } from './auth-cookies.service';
import { ClientType } from '../../common/types/client-type.enum';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';

describe('AuthController — Client Token Delivery Strategy', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let authCookiesService: jest.Mocked<AuthCookiesService>;
  let mockResponse: jest.Mocked<Response>;
  let mockRequest: jest.Mocked<Request>;

  const mockUser = {
    id: 1,
    instituteId: 10,
    fullName: 'Test User',
    phone: '+966500000001',
    role: 'INSTITUTE_ADMIN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTokens = {
    accessToken: 'access-token-xyz',
    refreshToken: 'refresh-token-abc',
  };

  beforeEach(() => {
    authService = {
      login: jest.fn().mockResolvedValue({
        ...mockTokens,
        user: mockUser,
      }),
      refresh: jest.fn().mockResolvedValue(mockTokens),
      logout: jest.fn().mockResolvedValue(undefined),
      getProfile: jest.fn().mockResolvedValue({
        ...mockUser,
        institute: { id: 10, name: 'Test Institute' },
      } as any),
    } as any;

    authCookiesService = {
      setAuthCookies: jest.fn(),
      clearAuthCookies: jest.fn(),
      extractCookie: jest.fn(),
    } as any;

    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as any;

    mockRequest = {
      cookies: {},
      headers: {},
    } as any;

    controller = new AuthController(authService, authCookiesService);
  });

  describe('POST /auth/login', () => {
    const loginDto = { phone: '+966500000001', password: 'Password123!' };

    it('Mobile: returns accessToken, refreshToken, and user in JSON body without setting cookies', async () => {
      const result = await controller.login(loginDto, ClientType.MOBILE, mockResponse);

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(authCookiesService.setAuthCookies).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: mockTokens.accessToken,
        refreshToken: mockTokens.refreshToken,
        user: mockUser,
      });
    });

    it('Web: sets HttpOnly cookies and returns only user in JSON body (no tokens)', async () => {
      const result = await controller.login(loginDto, ClientType.WEB, mockResponse);

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(authCookiesService.setAuthCookies).toHaveBeenCalledWith(
        mockResponse,
        {
          accessToken: mockTokens.accessToken,
          refreshToken: mockTokens.refreshToken,
        },
      );
      expect(result).toEqual({ user: mockUser });
      expect((result as any).accessToken).toBeUndefined();
      expect((result as any).refreshToken).toBeUndefined();
    });
  });

  describe('POST /auth/refresh', () => {
    it('Mobile: accepts refreshToken in body and returns new tokens in JSON body without setting cookies', async () => {
      const refreshDto = { refreshToken: 'mobile-refresh-token' };

      const result = await controller.refresh(
        refreshDto,
        ClientType.MOBILE,
        mockRequest,
        mockResponse,
      );

      expect(authService.refresh).toHaveBeenCalledWith({
        refreshToken: 'mobile-refresh-token',
      });
      expect(authCookiesService.setAuthCookies).not.toHaveBeenCalled();
      expect(result).toEqual(mockTokens);
    });

    it('Mobile: throws BadRequestException if refreshToken is missing in body', async () => {
      const refreshDto = {};

      await expect(
        controller.refresh(refreshDto, ClientType.MOBILE, mockRequest, mockResponse),
      ).rejects.toThrow(BadRequestException);

      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('Web: extracts refreshToken from HttpOnly cookie, sets new cookies, and returns success message', async () => {
      authCookiesService.extractCookie.mockReturnValue('cookie-refresh-token');

      const result = await controller.refresh(
        {},
        ClientType.WEB,
        mockRequest,
        mockResponse,
      );

      expect(authCookiesService.extractCookie).toHaveBeenCalledWith(
        mockRequest,
        REFRESH_TOKEN_COOKIE,
      );
      expect(authService.refresh).toHaveBeenCalledWith({
        refreshToken: 'cookie-refresh-token',
      });
      expect(authCookiesService.setAuthCookies).toHaveBeenCalledWith(
        mockResponse,
        mockTokens,
      );
      expect(result).toEqual({ message: 'Tokens refreshed successfully' });
      expect((result as any).accessToken).toBeUndefined();
    });

    it('Web: accepts refreshToken from body if provided, sets new cookies, and returns success message', async () => {
      const result = await controller.refresh(
        { refreshToken: 'body-refresh-token' },
        ClientType.WEB,
        mockRequest,
        mockResponse,
      );

      expect(authService.refresh).toHaveBeenCalledWith({
        refreshToken: 'body-refresh-token',
      });
      expect(authCookiesService.setAuthCookies).toHaveBeenCalledWith(
        mockResponse,
        mockTokens,
      );
      expect(result).toEqual({ message: 'Tokens refreshed successfully' });
    });

    it('Web: throws UnauthorizedException if no refresh token is provided in cookie or body', async () => {
      authCookiesService.extractCookie.mockReturnValue(undefined);

      await expect(
        controller.refresh({}, ClientType.WEB, mockRequest, mockResponse),
      ).rejects.toThrow(UnauthorizedException);

      expect(authService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/logout', () => {
    const user = { id: 1, instituteId: 10, role: 'INSTITUTE_ADMIN' };

    it('Mobile: revokes token in DB without clearing cookies', async () => {
      const result = await controller.logout(user, ClientType.MOBILE, mockResponse);

      expect(authService.logout).toHaveBeenCalledWith(1);
      expect(authCookiesService.clearAuthCookies).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('Web: revokes token in DB and clears HttpOnly cookies', async () => {
      const result = await controller.logout(user, ClientType.WEB, mockResponse);

      expect(authService.logout).toHaveBeenCalledWith(1);
      expect(authCookiesService.clearAuthCookies).toHaveBeenCalledWith(mockResponse);
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('GET /auth/me', () => {
    it('returns user profile for authenticated user', async () => {
      const user = { id: 1, instituteId: 10, role: 'INSTITUTE_ADMIN' };
      const profile = await controller.me(user);

      expect(authService.getProfile).toHaveBeenCalledWith(1);
      expect(profile.id).toBe(1);
    });
  });
});
