import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';
import { UserSystemRepository } from '../src/modules/users/user-system.repository';
import bcrypt from 'bcryptjs';

describe('Auth & Multi-Tenancy Architecture (e2e)', () => {
  let app: INestApplication;
  let mockUserSystemRepo: any;

  const institute1User = {
    id: 1,
    instituteId: 101,
    fullName: 'Admin Al-Noor',
    phone: '+966511111111',
    passwordHash: '',
    role: 'INSTITUTE_ADMIN',
    createdAt: new Date(),
    updatedAt: new Date(),
    institute: {
      id: 101,
      name: 'Al-Noor Academy',
    },
  };

  const institute2User = {
    id: 2,
    instituteId: 202,
    fullName: 'Admin Sunrise',
    phone: '+966522222222',
    passwordHash: '',
    role: 'INSTITUTE_ADMIN',
    createdAt: new Date(),
    updatedAt: new Date(),
    institute: {
      id: 202,
      name: 'Sunrise School',
    },
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    institute1User.passwordHash = passwordHash;
    institute2User.passwordHash = passwordHash;

    mockUserSystemRepo = {
      findByPhone: jest.fn(async (phone: string) => {
        if (phone === institute1User.phone) return institute1User;
        if (phone === institute2User.phone) return institute2User;
        return null;
      }),
      findById: jest.fn(async (id: number) => {
        if (id === 1) return institute1User;
        if (id === 2) return institute2User;
        return null;
      }),
      findByIdWithInstitute: jest.fn(async (id: number) => {
        if (id === 1) return institute1User;
        if (id === 2) return institute2User;
        return null;
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UserSystemRepository)
      .useValue(mockUserSystemRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('successfully logs in user from Institute 1 and returns tokens with tenant context', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          phone: '+966511111111',
          password: 'Password123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toEqual(
        expect.objectContaining({
          id: 1,
          instituteId: 101,
          fullName: 'Admin Al-Noor',
          phone: '+966511111111',
          role: 'INSTITUTE_ADMIN',
        }),
      );
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('rejects invalid password with 401 and consistent error format', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          phone: '+966511111111',
          password: 'WrongPassword!',
        })
        .expect(401);

      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 401,
          message: 'Invalid credentials',
          path: '/api/auth/login',
        }),
      );
    });

    it('validates request DTO with 400 Bad Request on missing fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ phone: '+966511111111' }) // Missing password
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('GET /api/auth/me (Protected Route & Tenant Context)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('resolves authenticated user & tenant context from JWT for Institute 1', async () => {
      // 1. Login to get token
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          phone: '+966511111111',
          password: 'Password123!',
        });

      const token = loginRes.body.accessToken;

      // 2. Access protected endpoint
      const meRes = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meRes.body.id).toBe(1);
      expect(meRes.body.instituteId).toBe(101);
      expect(meRes.body.institute.name).toBe('Al-Noor Academy');
      expect(meRes.body.passwordHash).toBeUndefined();
    });

    it('resolves distinct tenant context for Institute 2 user without leaking', async () => {
      // 1. Login Institute 2 user
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          phone: '+966522222222',
          password: 'Password123!',
        });

      const token = loginRes.body.accessToken;

      // 2. Access protected endpoint
      const meRes = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meRes.body.id).toBe(2);
      expect(meRes.body.instituteId).toBe(202);
      expect(meRes.body.institute.name).toBe('Sunrise School');
    });
  });

  describe('POST /api/auth/refresh & POST /api/auth/logout', () => {
    it('refreshes token successfully and allows logout revocation', async () => {
      // 1. Login
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          phone: '+966511111111',
          password: 'Password123!',
        });

      const { accessToken, refreshToken } = loginRes.body;

      // 2. Refresh token
      const refreshRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken');

      // 3. Logout
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 4. After logout, old refresh token is revoked
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshRes.body.refreshToken })
        .expect(401);
    });
  });
});
