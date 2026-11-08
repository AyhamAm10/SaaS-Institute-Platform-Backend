import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';
import { InstituteProfileRepository } from '../src/modules/institute-profile/institute-profile.repository';
import { MobileAccountsRepository } from '../src/modules/mobile-accounts/mobile-accounts.repository';
import { FamilyRepository } from '../src/modules/families/family.repository';
import { StudentRepository } from '../src/modules/students/student.repository';

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

  const mockFamily = { id: 1, familyName: 'العمر', phone: '0911223344' };
  const mockFamilyRepo = {
    findFamilyById: jest.fn(async (id: number) => (id === 1 ? mockFamily : null)),
  };

  const mockStudent = { id: 5, fullName: 'أحمد العمر', userId: null };
  const mockStudentWithAccount = {
    id: 6,
    fullName: 'سامي الخالد',
    userId: 25,
  };
  const mockStudentRepo = {
    findStudentById: jest.fn(async (id: number) => {
      if (id === 5) return mockStudent;
      if (id === 6) return mockStudentWithAccount;
      return null;
    }),
  };

  const mockMobileRepo = {
    findAccounts: jest.fn(async () => ({
      data: [
        {
          id: 20,
          fullName: 'ولي أمر تجريبي',
          phone: '0933333333',
          role: 'FAMILY',
          status: 'ACTIVE',
          createdAt: new Date(),
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    })),
    findStudentsWithoutAccount: jest.fn(async () => [
      { id: 5, fullName: 'أحمد العمر', familyId: 1, familyName: 'العمر' },
    ]),
    findByPhone: jest.fn(async (phone: string) => {
      if (phone === '0999999999') {
        return { id: 99, phone: '0999999999' };
      }
      return null;
    }),
    findMobileUserById: jest.fn(async (id: number) => {
      if (id === 20 || id === 25) {
        return {
          id,
          fullName: 'مستخدم تجريبي',
          phone: '0933333333',
          role: 'FAMILY',
          deletedAt: null,
        };
      }
      return null;
    }),
    getAccountById: jest.fn(async (id: number) => ({
      id,
      fullName: 'مستخدم جديد',
      phone: '0911111111',
      role: 'FAMILY',
      status: 'ACTIVE',
      createdAt: new Date(),
    })),
    createGuardianAccount: jest.fn(async () => 50),
    createStudentAccount: jest.fn(async () => 51),
    update: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({})),
    getInstituteId: jest.fn(() => 10),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(InstituteProfileRepository)
      .useValue(mockProfileRepo)
      .overrideProvider(MobileAccountsRepository)
      .useValue(mockMobileRepo)
      .overrideProvider(FamilyRepository)
      .useValue(mockFamilyRepo)
      .overrideProvider(StudentRepository)
      .useValue(mockStudentRepo)
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

  describe('Mobile Accounts Endpoints', () => {
    it('GET /api/mobile-accounts - 401 Unauthorized without token', async () => {
      await request(app.getHttpServer())
        .get('/api/mobile-accounts')
        .expect(401);
    });

    it('GET /api/mobile-accounts - 403 Forbidden for TEACHER (lacks students.view)', async () => {
      await request(app.getHttpServer())
        .get('/api/mobile-accounts')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(403);
    });

    it('GET /api/mobile-accounts - 200 OK for ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/mobile-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].role).toBe('FAMILY');
    });

    it('POST /api/mobile-accounts/guardians - 404 when family does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/mobile-accounts/guardians')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          familyId: 999,
          fullName: 'أبو أحمد',
          phone: '0912121212',
          relationship: 'FATHER',
          password: 'Password123!',
        })
        .expect(404);
    });

    it('POST /api/mobile-accounts/guardians - 409 when phone is duplicate', async () => {
      await request(app.getHttpServer())
        .post('/api/mobile-accounts/guardians')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          familyId: 1,
          fullName: 'أبو أحمد',
          phone: '0999999999', // mock returns duplicate
          relationship: 'FATHER',
          password: 'Password123!',
        })
        .expect(409);
    });

    it('POST /api/mobile-accounts/guardians - 201 Created on valid input', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/mobile-accounts/guardians')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          familyId: 1,
          fullName: 'أبو أحمد',
          phone: '0912121212',
          relationship: 'FATHER',
          password: 'Password123!',
        })
        .expect(201);

      expect(res.body.id).toBe(50);
    });

    it('POST /api/mobile-accounts/students - 404 when student not found', async () => {
      await request(app.getHttpServer())
        .post('/api/mobile-accounts/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId: 999,
          phone: '0944444444',
          password: 'Password123!',
        })
        .expect(404);
    });

    it('POST /api/mobile-accounts/students - 400 when student already has account', async () => {
      await request(app.getHttpServer())
        .post('/api/mobile-accounts/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId: 6, // mock student has userId: 25
          phone: '0944444444',
          password: 'Password123!',
        })
        .expect(400);
    });

    it('POST /api/mobile-accounts/students - 201 Created on valid input', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/mobile-accounts/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId: 5,
          phone: '0944444444',
          password: 'Password123!',
        })
        .expect(201);

      expect(res.body.id).toBe(51);
    });

    it('POST /api/mobile-accounts/:userId/reset-password - 404 when user not found', async () => {
      await request(app.getHttpServer())
        .post('/api/mobile-accounts/999/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          password: 'NewPassword123!',
        })
        .expect(404);
    });

    it('POST /api/mobile-accounts/:userId/reset-password - 200 OK on valid reset', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/mobile-accounts/20/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          password: 'NewPassword123!',
        })
        .expect(201);

      expect(res.body.updated).toBe(true);
    });

    it('DELETE /api/mobile-accounts/:userId - 404 when user not found', async () => {
      await request(app.getHttpServer())
        .delete('/api/mobile-accounts/999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('DELETE /api/mobile-accounts/:userId - 200 OK on deactivation', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/mobile-accounts/20')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.deactivated).toBe(true);
    });
  });
});
