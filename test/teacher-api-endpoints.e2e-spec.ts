import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';
import { TeacherProfileService } from '../src/modules/teacher-api/teacher-profile.service';
import { TeacherStudyService } from '../src/modules/teacher-api/teacher-study.service';
import { TeacherOverviewService } from '../src/modules/teacher-api/teacher-overview.service';
import { ExamsService } from '../src/modules/exams/exams.service';

process.env['THROTTLE_LOGIN_LIMIT'] = '1000';
process.env['JOBS_ENABLED'] = 'false';

/** HTTP layer of /teacher/*: roles and input validation; and the new exam permission of a teacher. */
describe('Teacher API (e2e)', () => {
  let app: INestApplication;
  let teacherToken: string;
  let familyToken: string;
  let registrarToken: string;

  const profile = {
    getMe: jest.fn(async () => ({ teacher: { id: 5 } })),
    getExamTypes: jest.fn(async () => [{ id: 1, name: 'مذاكرة' }]),
  };
  const study = {
    getTimetable: jest.fn(async () => ({ days: [] })),
    getSections: jest.fn(async () => []),
    getStudents: jest.fn(async (sectionId: number, query: any) => ({
      section: { id: sectionId },
      students: [],
      subjectId: query.subjectId ?? null,
    })),
  };
  const overview = { getOverview: jest.fn(async () => ({ date: '2026-11-15' })) };
  const exams = {
    create: jest.fn(async (dto: any) => ({ id: 1, ...dto })),
    findAll: jest.fn(async () => ({ data: [] })),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TeacherProfileService)
      .useValue(profile)
      .overrideProvider(TeacherStudyService)
      .useValue(study)
      .overrideProvider(TeacherOverviewService)
      .useValue(overview)
      .overrideProvider(ExamsService)
      .useValue(exams)
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
    teacherToken = token(3, 'TEACHER');
    familyToken = token(4, 'FAMILY');
    registrarToken = token(2, 'REGISTRAR');
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('401 without a token', async () => {
    await request(app.getHttpServer()).get('/api/teacher/me').expect(401);
  });

  it('only a TEACHER reaches /teacher/*', async () => {
    for (const path of ['me', 'overview', 'timetable', 'sections', 'exam-types']) {
      await request(app.getHttpServer()).get(`/api/teacher/${path}`).set(auth(familyToken)).expect(403);
      await request(app.getHttpServer()).get(`/api/teacher/${path}`).set(auth(registrarToken)).expect(403);
      await request(app.getHttpServer()).get(`/api/teacher/${path}`).set(auth(teacherToken)).expect(200);
    }
  });

  it('serves the roster of a section and validates its input', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api/teacher/sections/3/students?subjectId=5')
      .set(auth(teacherToken))
      .expect(200);
    expect(ok.body.section.id).toBe(3);
    expect(ok.body.subjectId).toBe(5);

    await request(app.getHttpServer())
      .get('/api/teacher/sections/abc/students')
      .set(auth(teacherToken))
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/teacher/sections/3/students?subjectId=-2')
      .set(auth(teacherToken))
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/teacher/sections/3/students?branchId=2')
      .set(auth(teacherToken))
      .expect(400);
  });

  it('a teacher may now create exams (the service limits them to their subjects); a registrar may not', async () => {
    const body = {
      sectionId: 3,
      subjectId: 5,
      title: 'مذاكرة أولى',
      examDate: '2026-11-20',
      maxMark: 100,
      passMark: 50,
    };
    await request(app.getHttpServer())
      .post('/api/exams')
      .set(auth(teacherToken))
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/exams')
      .set(auth(registrarToken))
      .send(body)
      .expect(403);
  });
});
