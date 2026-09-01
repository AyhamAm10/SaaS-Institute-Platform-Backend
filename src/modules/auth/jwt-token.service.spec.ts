import { jest } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtTokenService } from './jwt-token.service';

describe('JwtTokenService', () => {
  let service: JwtTokenService;
  let jwtService: JwtService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret-12345';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret-67890';
        return '';
      }),
      get: jest.fn((key: string, defaultValue: string) => defaultValue),
    } as any;

    jwtService = new JwtService({});
    service = new JwtTokenService(jwtService, configService);
  });

  it('generates and verifies access token with correct payload', () => {
    const payload = { sub: 1, instituteId: 5, role: 'INSTITUTE_ADMIN' };
    const token = service.generateAccessToken(payload);
    expect(typeof token).toBe('string');

    const decoded = service.verifyAccessToken(token);
    expect(decoded.sub).toBe(1);
    expect(decoded.instituteId).toBe(5);
    expect(decoded.role).toBe('INSTITUTE_ADMIN');
  });

  it('generates and verifies refresh token with separate secret', () => {
    const payload = { sub: 1 };
    const refreshToken = service.generateRefreshToken(payload);
    expect(typeof refreshToken).toBe('string');

    const decoded = service.verifyRefreshToken(refreshToken);
    expect(decoded.sub).toBe(1);

    // Refresh token cannot be decoded as an access token (different secret)
    expect(() => service.verifyAccessToken(refreshToken)).toThrow();
  });

  it('generates deterministic SHA-256 hashes for refresh tokens', () => {
    const token = 'sample-refresh-token';
    const hash1 = service.hashToken(token);
    const hash2 = service.hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex length
  });
});
