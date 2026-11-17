import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';
import { StudentNoteRepository } from '../src/modules/student-notes/student-note.repository';
import { StudentRepository } from '../src/modules/students/student.repository';

process.env['THROTTLE_LOGIN_LIMIT'] = '1000';
process.env['JOBS_ENABLED'] = 'false';

describe('Student notes (e2e)', () => {
  let app: INestApplication;
  const token: Record<string, string> = {};

  const note = (over: Record<string, unknown> = {}) => ({
    id: 1,
    studentId: 4,
    body: 'ملاحظة',
    visibleToFamily: true,
    createdAt: new Date('2026-11-10T08:00:00Z'),
    updatedAt: new Date('2026-11-10T08:00:00Z'),
    createdBy: { fullName: 'الإدارة' },
    ...over,
  });

  const notesRepo = {
    findByStudent: jest.fn(async () => [note()]),
    findWithAuthor: jest.fn(async () => note()),
    findById: jest.fn(async () => note()),
    create: jest.fn(async () => note()),
    update: jest.fn(async () => note()),
    delete: jest.fn(async () => note()),
  };
  const studentsRepo = {
    findById: jest.fn(async (id: number) => (id === 4 ? { id: 4 } : null)),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StudentNoteRepository)
      .useValue(notesRepo)
      .overrideProvider(StudentRepository)
      .useValue(studentsRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    const jwt = app.get(JwtTokenService);
    for (const [i, role] of ['INSTITUTE_ADMIN', 'REGISTRAR', 'DATA_ENTRY', 'ACCOUNTANT', 'FAMILY'].entries()) {
      token[role] = jwt.generateAccessToken({ sub: i + 1, instituteId: 10, role });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (role: string) => ({ Authorization: `Bearer ${token[role]}` });

  it('lists the notes of a student for staff who see students', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/students/4/notes')
      .set(as('DATA_ENTRY'))
      .expect(200);
    expect(res.body[0]).toMatchObject({ id: 1, body: 'ملاحظة', author: 'الإدارة' });
  });

  it('an accountant may read students but not write notes', async () => {
    await request(app.getHttpServer()).get('/api/students/4/notes').set(as('ACCOUNTANT')).expect(200);
    await request(app.getHttpServer())
      .post('/api/students/4/notes')
      .set(as('ACCOUNTANT'))
      .send({ body: 'x' })
      .expect(403);
  });

  it('data entry writes and edits notes', async () => {
    await request(app.getHttpServer())
      .post('/api/students/4/notes')
      .set(as('DATA_ENTRY'))
      .send({ body: 'مرحباً', visibleToFamily: false })
      .expect(201);
    expect(notesRepo.create).toHaveBeenCalledWith({ studentId: 4, body: 'مرحباً', visibleToFamily: false });
    await request(app.getHttpServer())
      .patch('/api/student-notes/1')
      .set(as('DATA_ENTRY'))
      .send({ visibleToFamily: true })
      .expect(200);
  });

  it('rejects an empty or oversized note and unknown fields', async () => {
    const post = (body: object) =>
      request(app.getHttpServer()).post('/api/students/4/notes').set(as('INSTITUTE_ADMIN')).send(body);
    await post({ body: '   ' }).expect(400);
    await post({ body: 'x'.repeat(1001) }).expect(400);
    await post({ body: 'ok', extra: 1 }).expect(400);
  });

  it('answers 404 for an unknown student', async () => {
    await request(app.getHttpServer()).get('/api/students/99/notes').set(as('INSTITUTE_ADMIN')).expect(404);
  });

  it('only admins and registrars delete; data entry is refused', async () => {
    await request(app.getHttpServer()).delete('/api/student-notes/1').set(as('DATA_ENTRY')).expect(403);
    await request(app.getHttpServer()).delete('/api/student-notes/1').set(as('REGISTRAR')).expect(200);
    await request(app.getHttpServer()).delete('/api/student-notes/1').set(as('INSTITUTE_ADMIN')).expect(200);
  });

  it('a guardian cannot use the staff endpoints', async () => {
    await request(app.getHttpServer()).get('/api/students/4/notes').set(as('FAMILY')).expect(403);
    await request(app.getHttpServer()).post('/api/students/4/notes').set(as('FAMILY')).send({ body: 'x' }).expect(403);
  });
});
