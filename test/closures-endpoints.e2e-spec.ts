import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';
import { ClosureRepository } from '../src/modules/closures/closure.repository';
import { BranchRepository } from '../src/modules/branches/branch.repository';
import { SectionRepository } from '../src/modules/sections/section.repository';

process.env['THROTTLE_LOGIN_LIMIT'] = '1000';
process.env['JOBS_ENABLED'] = 'false';

/** HTTP layer of /closures: permissions, DTO validation and the rules, with in-memory repositories. */
describe('Closures Endpoints (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let registrarToken: string;
  let teacherToken: string;

  const store = new Map<number, any>();
  let nextId = 1;
  const withRefs = (c: any) => ({
    ...c,
    branch: c.branchId ? { id: c.branchId, name: 'فرع المزة' } : null,
    sections: (c.sectionIds ?? []).map((id: number) => ({
      section: { id, name: `شعبة ${id}` },
    })),
  });

  const closureRepo = {
    findOverlapping: jest.fn(async () => [...store.values()].map(withRefs)),
    findWithRefs: jest.fn(async (id: number) =>
      store.has(id) ? withRefs(store.get(id)) : null,
    ),
    findById: jest.fn(async (id: number) => store.get(id) ?? null),
    create: jest.fn(async (data: any) => {
      const row = { id: nextId++, sectionIds: [], ...data };
      store.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: number, data: any) => {
      store.set(id, { ...store.get(id), ...data });
      return store.get(id);
    }),
    delete: jest.fn(async (id: number) => {
      store.delete(id);
    }),
    replaceSections: jest.fn(async (id: number, sectionIds: number[]) => {
      store.set(id, { ...store.get(id), sectionIds });
    }),
  };
  const branchRepo = {
    findById: jest.fn(async (id: number) => (id === 4 ? { id: 4 } : null)),
  };
  const sectionRepo = {
    findMany: jest.fn(async (opts: any) =>
      (opts.where.id.in as number[])
        .filter((id) => id === 7 || id === 8)
        .map((id) => ({ id })),
    ),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ClosureRepository)
      .useValue(closureRepo)
      .overrideProvider(BranchRepository)
      .useValue(branchRepo)
      .overrideProvider(SectionRepository)
      .useValue(sectionRepo)
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

    const jwt = app.get(JwtTokenService);
    const token = (sub: number, role: string) =>
      jwt.generateAccessToken({ sub, instituteId: 10, role });
    adminToken = token(1, 'INSTITUTE_ADMIN');
    registrarToken = token(2, 'REGISTRAR');
    teacherToken = token(3, 'TEACHER');
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const body = {
    scope: 'INSTITUTE',
    fromDate: '2026-11-10',
    toDate: '2026-11-12',
    reason: 'عطلة رسمية',
  };

  it('401 without a token', async () => {
    await request(app.getHttpServer()).get('/api/closures').expect(401);
  });

  it('a teacher cannot even list closures', async () => {
    await request(app.getHttpServer())
      .get('/api/closures')
      .set(auth(teacherToken))
      .expect(403);
  });

  it('a registrar may view but not change closures', async () => {
    await request(app.getHttpServer())
      .get('/api/closures')
      .set(auth(registrarToken))
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/closures')
      .set(auth(registrarToken))
      .send(body)
      .expect(403);
  });

  it('an admin creates, lists, updates and deletes an institute closure', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/closures')
      .set(auth(adminToken))
      .send(body)
      .expect(201);
    expect(created.body).toEqual(
      expect.objectContaining({
        scope: 'INSTITUTE',
        fromDate: '2026-11-10',
        toDate: '2026-11-12',
        reason: 'عطلة رسمية',
        sections: [],
      }),
    );
    const id = created.body.id;

    const list = await request(app.getHttpServer())
      .get('/api/closures')
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.map((c: any) => c.id)).toContain(id);

    const updated = await request(app.getHttpServer())
      .patch(`/api/closures/${id}`)
      .set(auth(adminToken))
      .send({ reason: 'عطلة العيد' })
      .expect(200);
    expect(updated.body.reason).toBe('عطلة العيد');

    await request(app.getHttpServer())
      .delete(`/api/closures/${id}`)
      .set(auth(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/closures/${id}`)
      .set(auth(adminToken))
      .send({ reason: 'xx' })
      .expect(404);
  });

  it('creates branch and section closures with their targets', async () => {
    const branch = await request(app.getHttpServer())
      .post('/api/closures')
      .set(auth(adminToken))
      .send({ ...body, scope: 'BRANCH', branchId: 4 })
      .expect(201);
    expect(branch.body.branchName).toBe('فرع المزة');

    const sections = await request(app.getHttpServer())
      .post('/api/closures')
      .set(auth(adminToken))
      .send({ ...body, scope: 'SECTION', sectionIds: [7, 8] })
      .expect(201);
    expect(sections.body.sections.map((s: any) => s.id)).toEqual([7, 8]);
  });

  it('rejects bad input with 400 and an Arabic message', async () => {
    const range = await request(app.getHttpServer())
      .post('/api/closures')
      .set(auth(adminToken))
      .set('Accept-Language', 'ar')
      .send({ ...body, fromDate: '2026-11-13' })
      .expect(400);
    expect(range.body.message).toContain('تاريخ النهاية');

    // missing branch / sections for the scope, unknown section, extra property
    await request(app.getHttpServer())
      .post('/api/closures')
      .set(auth(adminToken))
      .send({ ...body, scope: 'BRANCH' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/closures')
      .set(auth(adminToken))
      .send({ ...body, scope: 'SECTION', sectionIds: [7, 99] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/closures')
      .set(auth(adminToken))
      .send({ ...body, instituteId: 3 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/closures')
      .set(auth(adminToken))
      .send({ ...body, fromDate: 'tomorrow' })
      .expect(400);
  });
});
