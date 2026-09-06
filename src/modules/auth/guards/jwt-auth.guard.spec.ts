import { jest } from '@jest/globals';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtTokenService } from '../jwt-token.service';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('JwtAuthGuard — Dual Token Extraction (Header & Cookie)', () => {
  let guard: JwtAuthGuard;
  let jwtTokenService: jest.Mocked<JwtTokenService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    jwtTokenService = {
      verifyAccessToken: jest.fn(),
    } as any;

    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    guard = new JwtAuthGuard(jwtTokenService, reflector);
  });

  function createMockContext(request: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('bypasses authentication when route is marked @Public()', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext({});

    const result = guard.canActivate(context);
    expect(result).toBe(true);
    expect(jwtTokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('Mobile: authenticates using Bearer token from Authorization header', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtTokenService.verifyAccessToken.mockReturnValue({
      sub: 1,
      instituteId: 10,
      role: 'INSTITUTE_ADMIN',
    });

    const request: any = {
      headers: { authorization: 'Bearer mobile-jwt-token' },
    };
    const context = createMockContext(request);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtTokenService.verifyAccessToken).toHaveBeenCalledWith('mobile-jwt-token');
    expect(request.user).toEqual({
      id: 1,
      instituteId: 10,
      role: 'INSTITUTE_ADMIN',
    });
  });

  it('Web: authenticates using access_token from HttpOnly cookie', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtTokenService.verifyAccessToken.mockReturnValue({
      sub: 2,
      instituteId: 20,
      role: 'SUPER_ADMIN',
    });

    const request: any = {
      headers: {},
      cookies: { access_token: 'web-cookie-jwt-token' },
    };
    const context = createMockContext(request);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtTokenService.verifyAccessToken).toHaveBeenCalledWith('web-cookie-jwt-token');
    expect(request.user).toEqual({
      id: 2,
      instituteId: 20,
      role: 'SUPER_ADMIN',
    });
  });

  it('Web: authenticates using access_token from raw Cookie header when req.cookies is undefined', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtTokenService.verifyAccessToken.mockReturnValue({
      sub: 3,
      instituteId: 30,
      role: 'TEACHER',
    });

    const request: any = {
      headers: {
        cookie: 'sessionId=abc; access_token=raw-header-cookie-token; other=xyz',
      },
      cookies: undefined,
    };
    const context = createMockContext(request);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtTokenService.verifyAccessToken).toHaveBeenCalledWith('raw-header-cookie-token');
    expect(request.user).toEqual({
      id: 3,
      instituteId: 30,
      role: 'TEACHER',
    });
  });

  it('throws UnauthorizedException when neither header nor cookie token is provided', () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    const request: any = {
      headers: {},
      cookies: {},
    };
    const context = createMockContext(request);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(jwtTokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when token verification fails (invalid / expired)', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtTokenService.verifyAccessToken.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const request: any = {
      headers: { authorization: 'Bearer expired-token' },
    };
    const context = createMockContext(request);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
