import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';
import { AuditViewService } from '../src/modules/staff/audit-view.service';

process.env['THROTTLE_LOGIN_LIMIT'] = '1000';
process.env['JOBS_ENABLED'] = 'false';

describe('Audit viewer (e2e)', () => {
  let app: INestApplication;
  const token: Record<string, string> = {};
  const audit = {
    search: jest.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 })),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuditViewService)
      .useValue(audit)
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    const jwt = app.get(JwtTokenService);
    for (const [i, role] of ['INSTITUTE_ADMIN', 'REGISTRAR', 'ACCOUNTANT', 'DATA_ENTRY'].entries()) {
      token[role] = jwt.generateAccessToken({ sub: i + 1, instituteId: 10, role });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (role: string, qs = '') =>
    request(app.getHttpServer()).get(`/api/audit-log${qs}`).set({ Authorization: `Bearer ${token[role]}` });

  it('the general manager reads the audit log with filters', async () => {
    await get('INSTITUTE_ADMIN', '?entity=student&action=UPDATE&from=2026-11-01&to=2026-11-10&page=2').expect(200);
    expect(audit.search).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'student', action: 'UPDATE', from: '2026-11-01', to: '2026-11-10', page: 2 }),
    );
  });

  it('nobody else sees it', async () => {
    for (const role of ['REGISTRAR', 'ACCOUNTANT', 'DATA_ENTRY']) await get(role).expect(403);
  });

  it('rejects bad filters', async () => {
    await get('INSTITUTE_ADMIN', '?action=EXPLODE').expect(400);
    await get('INSTITUTE_ADMIN', '?from=yesterday').expect(400);
    await get('INSTITUTE_ADMIN', '?limit=500').expect(400);
  });
});
