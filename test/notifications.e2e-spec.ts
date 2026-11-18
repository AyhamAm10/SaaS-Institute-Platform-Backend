import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';
import { NotificationRepository } from '../src/modules/notifications/notification.repository';
import { DeviceTokenRepository } from '../src/modules/notifications/device-token.repository';
import { NotificationSettingRepository } from '../src/modules/notifications/notification-setting.repository';

process.env['THROTTLE_LOGIN_LIMIT'] = '1000';
process.env['JOBS_ENABLED'] = 'false';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  const token: Record<string, string> = {};

  const inboxRow = {
    id: 3,
    userId: 1,
    type: 'ATTENDANCE_ARRIVAL',
    title: 'وصل يزن إلى المعهد',
    body: 'سُجّل الحضور الساعة 08:05',
    data: { type: 'ATTENDANCE_ARRIVAL', path: '/attendance', studentId: 4 },
    studentId: 4,
    readAt: null,
    createdAt: new Date('2026-11-17T05:05:00Z'),
  };
  const notificationsRepo = {
    findPage: jest.fn(async () => ({ data: [inboxRow], total: 1, unread: 1 })),
    countUnread: jest.fn(async () => 1),
    markRead: jest.fn(async () => 1),
  };
  const devicesRepo = { upsert: jest.fn(async () => undefined), removeForUser: jest.fn(async () => 1) };
  const settingsRepo = {
    disabledFor: jest.fn(async () => ['FINANCE']),
    save: jest.fn(async () => undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationRepository)
      .useValue(notificationsRepo)
      .overrideProvider(DeviceTokenRepository)
      .useValue(devicesRepo)
      .overrideProvider(NotificationSettingRepository)
      .useValue(settingsRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    const jwt = app.get(JwtTokenService);
    for (const [i, role] of ['FAMILY', 'STUDENT', 'TEACHER', 'INSTITUTE_ADMIN'].entries()) {
      token[role] = jwt.generateAccessToken({ sub: i + 1, instituteId: 10, role });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (role: string) => ({ Authorization: `Bearer ${token[role]}` });
  const http = () => request(app.getHttpServer());

  it('gives a guardian their own inbox with the unread count', async () => {
    const res = await http().get('/api/notifications?page=1&limit=20').set(as('FAMILY')).expect(200);
    expect(res.body).toMatchObject({ total: 1, unread: 1, data: [{ id: 3, read: false, studentId: 4 }] });
    expect(notificationsRepo.findPage).toHaveBeenCalledWith(1, 0, 20);
  });

  it('lets students and teachers read their badge and mark everything read', async () => {
    await http().get('/api/notifications/unread-count').set(as('STUDENT')).expect(200, { unread: 1 });
    await http().post('/api/notifications/read-all').set(as('TEACHER')).expect(200);
    expect(notificationsRepo.markRead).toHaveBeenLastCalledWith(3, undefined);
    await http().post('/api/notifications/3/read').set(as('FAMILY')).expect(200);
    expect(notificationsRepo.markRead).toHaveBeenLastCalledWith(1, 3);
  });

  it('registers and removes a device of the signed-in user', async () => {
    await http()
      .post('/api/notifications/devices')
      .set(as('FAMILY'))
      .send({ token: 'fcm-token-1234567890', platform: 'WEB', app: 'PARENTS' })
      .expect(200);
    expect(devicesRepo.upsert).toHaveBeenCalledWith({ userId: 1, token: 'fcm-token-1234567890', platform: 'WEB', app: 'PARENTS' });
    await http().delete('/api/notifications/devices').set(as('FAMILY')).send({ token: 'fcm-token-1234567890' }).expect(200);
  });

  it('rejects an unknown platform, app or extra field', async () => {
    const post = (body: object) => http().post('/api/notifications/devices').set(as('TEACHER')).send(body);
    await post({ token: 'fcm-token-1234567890', platform: 'SMS', app: 'TEACHER' }).expect(400);
    await post({ token: 'fcm-token-1234567890', platform: 'ANDROID', app: 'OTHER' }).expect(400);
    await post({ token: 'fcm-token-1234567890', platform: 'ANDROID', app: 'TEACHER', x: 1 }).expect(400);
  });

  it('reads and saves the categories a user turned off', async () => {
    const res = await http().get('/api/notifications/settings').set(as('FAMILY')).expect(200);
    expect(res.body.categories).toContainEqual({ key: 'FINANCE', enabled: false });
    expect(res.body.categories).toContainEqual({ key: 'ATTENDANCE', enabled: true });
    await http().put('/api/notifications/settings').set(as('FAMILY')).send({ disabledCategories: ['STUDY'] }).expect(200);
    expect(settingsRepo.save).toHaveBeenCalledWith(1, ['STUDY']);
    await http().put('/api/notifications/settings').set(as('FAMILY')).send({ disabledCategories: ['NOPE'] }).expect(400);
  });

  it('is not a staff endpoint', async () => {
    await http().get('/api/notifications').set(as('INSTITUTE_ADMIN')).expect(403);
    await http().get('/api/notifications').expect(401);
  });
});
