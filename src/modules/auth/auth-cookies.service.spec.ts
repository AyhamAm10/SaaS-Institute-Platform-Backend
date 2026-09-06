import { jest } from '@jest/globals';
import { AuthCookiesService, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './auth-cookies.service';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';

describe('AuthCookiesService', () => {
  let service: AuthCookiesService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockResponse: jest.Mocked<Response>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'COOKIE_SECURE') return 'false';
        if (key === 'COOKIE_SAME_SITE') return 'lax';
        if (key === 'JWT_ACCESS_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        return defaultValue;
      }),
    } as any;

    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as any;

    service = new AuthCookiesService(mockConfigService);
  });

  describe('setAuthCookies', () => {
    it('sets access_token and refresh_token cookies with HttpOnly', () => {
      service.setAuthCookies(mockResponse, {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
      });

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE,
        'access-123',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 15 * 60 * 1000,
          path: '/',
        }),
      );

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        'refresh-456',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: '/',
        }),
      );
    });
  });

  describe('clearAuthCookies', () => {
    it('clears access_token and refresh_token cookies', () => {
      service.clearAuthCookies(mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE,
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE,
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
    });
  });

  describe('extractCookie', () => {
    it('extracts cookie from req.cookies if populated', () => {
      const req = {
        cookies: { [ACCESS_TOKEN_COOKIE]: 'cookie-token' },
        headers: {},
      } as unknown as Request;

      const token = service.extractCookie(req, ACCESS_TOKEN_COOKIE);
      expect(token).toBe('cookie-token');
    });

    it('extracts cookie from raw headers.cookie if req.cookies is missing', () => {
      const req = {
        cookies: undefined,
        headers: {
          cookie: 'other=123; refresh_token=raw-refresh-val; foo=bar',
        },
      } as unknown as Request;

      const token = service.extractCookie(req, REFRESH_TOKEN_COOKIE);
      expect(token).toBe('raw-refresh-val');
    });

    it('returns undefined if cookie is not found', () => {
      const req = {
        cookies: {},
        headers: {},
      } as unknown as Request;

      const token = service.extractCookie(req, 'non_existent');
      expect(token).toBeUndefined();
    });
  });
});
