import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';
import { InstituteProfileRepository } from '../src/modules/institute-profile/institute-profile.repository';
import { AccountsRepository } from '../src/modules/accounts/accounts.repository';
import { UserRepository } from '../src/modules/users/user.repository';
import { FamilyUserRepository } from '../src/modules/families/family-user.repository';
import { StudentRepository } from '../src/modules/students/student.repository';
import { AuthService } from '../src/modules/auth/auth.service';
import { TransactionHelper } from '../src/database/transaction.helper';

process.env['THROTTLE_LOGIN_LIMIT'] = '1000';
process.env['JOBS_ENABLED'] = 'false';

describe('Settings Endpoints (e2e)', () => {
  let app: INestApplication;
  let jwtTokenService: JwtTokenService;

  let adminToken: string;
  let teacherToken: string;

  const mockProfile = {
    id: 10,
    code: 'INS01',
    name: 'معهد الرواد',
    phone: '0112345678',
    address: 'دمشق',
    timezone: 'Asia/Damascus',
    logoUrl: '/logo.png',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockProfileRepo = {
    findProfile: jest.fn(async (id: number) =>
      id === 10 ? { ...mockProfile } : null,
    ),
    updateProfile: jest.fn(async (_id: number, data: any) => {
      Object.assign(mockProfile, data);
      return { ...mockProfile };
    }),
  };

  const account = (id: number, role: string, over: Record<string, unknown> = {}) => ({
    id,
    fullName: 'مستخدم تجريبي',
    phone: '09' + id,
    role,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date(),
    ...over,
  });

  const mockStudent = { id: 5, fullName: 'أحمد العمر', userId: null };
  const mockStudentWithAccount = { id: 6, fullName: 'سامي الخالد', userId: 25 };
  const mockStudentRepo = {
    findStudentById: jest.fn(async (id: number) => {
      if (id === 5) return mockStudent;
      if (id === 6) return mockStudentWithAccount;
      return null;
    }),
  };

  const mockAccountsRepo = {
    list: jest.fn(async () => ({
      data: [account(20, 'FAMILY', { linkedTo: 'العمر' })],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    })),
    findAccount: jest.fn(async (id: number) => {
      if (id === 20) return account(20, 'FAMILY');
      if (id === 21) return account(21, 'TEACHER');
      if (id === 1) return account(1, 'INSTITUTE_ADMIN');
      return null;
    }),
    findItem: jest.fn(async (id: number) => account(id, 'FAMILY')),
    setActive: jest.fn(async () => undefined),
    countActiveAdmins: jest.fn(async () => 2),
    findStudentsWithoutAccount: jest.fn(async () => [
      { id: 5, fullName: 'أحمد العمر', familyId: 1, familyName: 'العمر' },
    ]),
    linkStudent: jest.fn(async () => undefined),
  };

  const mockUserRepo = {
    findByPhone: jest.fn(async (phone: string) =>
      phone === '0999999999' ? { id: 99, phone } : null,
    ),
    createAccount: jest.fn(async (d: any) => ({ id: 51, ...d })),
    update: jest.fn(async () => ({})),
  };
  const mockFamilyUserRepo = {
    findFamiliesWithoutGuardian: jest.fn(async () => [{ id: 1 }]),
    countFamiliesWithoutPhone: jest.fn(async () => 3),
  };
  const mockAuth = { logout: jest.fn(async () => undefined) };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(InstituteProfileRepository)
      .useValue(mockProfileRepo)
      .overrideProvider(AccountsRepository)
      .useValue(mockAccountsRepo)
      .overrideProvider(UserRepository)
      .useValue(mockUserRepo)
      .overrideProvider(FamilyUserRepository)
      .useValue(mockFamilyUserRepo)
      .overrideProvider(StudentRepository)
      .useValue(mockStudentRepo)
      .overrideProvider(AuthService)
      .useValue(mockAuth)
      .overrideProvider(TransactionHelper)
      .useValue({ executeInTransaction: (fn: () => unknown) => fn() })
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

    jwtTokenService = app.get(JwtTokenService);
    adminToken = jwtTokenService.generateAccessToken({
      sub: 1,
      instituteId: 10,
      role: 'INSTITUTE_ADMIN',
    });
    teacherToken = jwtTokenService.generateAccessToken({
      sub: 2,
      instituteId: 10,
      role: 'TEACHER',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Institute Profile Endpoints', () => {
    it('GET /api/institute/profile - 401 Unauthorized without token', async () => {
      await request(app.getHttpServer())
        .get('/api/institute/profile')
        .expect(401);
    });

    it('GET /api/institute/profile - 200 OK with admin token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/institute/profile')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(10);
      expect(res.body.name).toBe('معهد الرواد');
      expect(res.body.timezone).toBe('Asia/Damascus');
    });

    it('PATCH /api/institute/profile - 400 on forbidden fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch('/api/institute/profile')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'تعديل',
          code: 'NEW_CODE', // forbidden
        })
        .expect(400);
    });

    it('PATCH /api/institute/profile - 400 on invalid IANA timezone', async () => {
      await request(app.getHttpServer())
        .patch('/api/institute/profile')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          timezone: 'Not/Real_Zone',
        })
        .expect(400);
    });

    it('PATCH /api/institute/profile - 200 OK on valid update', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/institute/profile')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'اسم معهد معدل',
          timezone: 'Asia/Riyadh',
        })
        .expect(200);

      expect(res.body.name).toBe('اسم معهد معدل');
    });
  });

  describe('Accounts Endpoints', () => {
    const get = (path: string, token?: string) => {
      const r = request(app.getHttpServer()).get(path);
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    };

    it('GET /api/accounts - 401 without token', async () => {
      await get('/api/accounts?type=families').expect(401);
    });

    it('GET /api/accounts - 403 for TEACHER (administration only)', async () => {
      await get('/api/accounts?type=families', teacherToken).expect(403);
    });

    it('GET /api/accounts - 400 for an unknown type', async () => {
      await get('/api/accounts?type=robots', adminToken).expect(400);
    });

    it('GET /api/accounts - 200 for ADMIN', async () => {
      const res = await get('/api/accounts?type=families', adminToken).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].role).toBe('FAMILY');
      expect(res.body.data[0]).not.toHaveProperty('passwordHash');
    });

    it('GET /api/accounts/summary - families still without an account', async () => {
      const res = await get('/api/accounts/summary', adminToken).expect(200);
      expect(res.body.missingFamilies).toEqual({ withPhone: 1, withoutPhone: 3 });
    });

    it('a token that still carries the default-password claim is refused everywhere', async () => {
      const forced = jwtTokenService.generateAccessToken({
        sub: 1,
        instituteId: 10,
        role: 'INSTITUTE_ADMIN',
        mcp: true,
      });
      const res = await get('/api/accounts?type=families', forced).expect(403);
      expect(JSON.stringify(res.body)).toContain('password');
    });

    it('POST /api/accounts/:id/reset-password - 200 and takes no body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/accounts/20/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.updated).toBe(true);
    });

    it('POST /api/accounts/:id/reset-password - 404 when the account does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts/999/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('POST /api/accounts/:id/reset-password - refuses your own account', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts/1/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('PATCH /api/accounts/:id/active - switches an account off and on', async () => {
      const off = await request(app.getHttpServer())
        .patch('/api/accounts/21/active')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);
      expect(off.body.id).toBe(21);
      expect(mockAccountsRepo.setActive).toHaveBeenCalledWith(
        expect.objectContaining({ id: 21 }),
        false,
      );
      await request(app.getHttpServer())
        .patch('/api/accounts/21/active')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true })
        .expect(200);
    });

    it('PATCH /api/accounts/:id/active - validates the body', async () => {
      await request(app.getHttpServer())
        .patch('/api/accounts/21/active')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: 'yes' })
        .expect(400);
    });

    it('POST /api/accounts/families/sync - creates the missing guardian accounts', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts/families/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('POST /api/accounts/students - 201 with the default password (no password field)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/accounts/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: 5, phone: '0944444444' })
        .expect(201);
      expect(res.body.id).toBe(51);
      await request(app.getHttpServer())
        .post('/api/accounts/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: 5, phone: '0944444444', password: 'Password123!' })
        .expect(400);
    });

    it('POST /api/accounts/students - 404 / 400 / 409', async () => {
      const post = (body: object) =>
        request(app.getHttpServer())
          .post('/api/accounts/students')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(body);
      await post({ studentId: 999, phone: '0944444444' }).expect(404);
      await post({ studentId: 6, phone: '0944444444' }).expect(400);
      await post({ studentId: 5, phone: '0999999999' }).expect(409);
    });
  });
});
