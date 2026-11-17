import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';
import { JwtTokenService } from '../src/modules/auth/jwt-token.service';
import { PaymentsService } from '../src/modules/fees/payments.service';

process.env['THROTTLE_LOGIN_LIMIT'] = '1000';
process.env['JOBS_ENABLED'] = 'false';

describe('Family payment (e2e)', () => {
  let app: INestApplication;
  const token: Record<string, string> = {};
  const payments = {
    createForFamily: jest.fn(async () => [{ id: 61 }, { id: 62 }]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PaymentsService)
      .useValue(payments)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    const jwt = app.get(JwtTokenService);
    for (const [i, role] of ['ACCOUNTANT', 'REGISTRAR', 'DATA_ENTRY'].entries()) {
      token[role] = jwt.generateAccessToken({ sub: i + 1, instituteId: 10, role });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (role: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/families/9/payments')
      .set({ Authorization: `Bearer ${token[role]}` })
      .send(body);

  const line = (contractId: number, amount = 1000) => ({ contractId, amount });

  it('an accountant records a payment covering several children', async () => {
    const res = await post('ACCOUNTANT', {
      payments: [line(7, 50000), line(8, 30000)],
      paymentMethod: 'CASH',
      note: 'دفعة العائلة',
    }).expect(201);
    expect(res.body).toHaveLength(2);
    expect(payments.createForFamily).toHaveBeenCalledWith(9, expect.objectContaining({ paymentMethod: 'CASH' }));
  });

  it('roles without fees.manage are refused', async () => {
    await post('REGISTRAR', { payments: [line(7)] }).expect(403);
    await post('DATA_ENTRY', { payments: [line(7)] }).expect(403);
  });

  it('validates the lines', async () => {
    await post('ACCOUNTANT', { payments: [] }).expect(400);
    await post('ACCOUNTANT', { payments: Array.from({ length: 11 }, (_, i) => line(i + 1)) }).expect(400);
    await post('ACCOUNTANT', { payments: [{ contractId: 7, amount: 0 }] }).expect(400);
    await post('ACCOUNTANT', { payments: [{ contractId: 7, amount: 1.234 }] }).expect(400);
    await post('ACCOUNTANT', { payments: [line(7)], extra: true }).expect(400);
  });
});
