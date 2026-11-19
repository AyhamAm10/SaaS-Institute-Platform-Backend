import { INestApplication, Type, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { AppModule } from '../../../src/app.module';
import { GlobalExceptionFilter } from '../../../src/common/errors/http-exception.filter';
import { PrismaService } from '../../../src/database/prisma.service';
import { PushSenderService } from '../../../src/modules/notifications/push-sender.service';
import { SuperAdminInitService } from '../../../src/modules/users/super-admin-init.service';
import { FakePushSender } from './fake-push-sender';

/** A running API exactly like production (`main.ts`), on the scenario test database. */
export interface ScenarioApp {
  app: INestApplication;
  prisma: PrismaService;
  push: FakePushSender;
  /** Runs a background job's real handler in the institute's context (no Redis worker). */
  runJob<T>(processor: Type<{ process(job: Job): Promise<unknown> }>, name: string, instituteId: number, data?: T): Promise<unknown>;
  close(): Promise<void>;
}

export async function startApp(): Promise<ScenarioApp> {
  const push = new FakePushSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PushSenderService)
    .useValue(push)
    .compile();

  const app = moduleRef.createNestApplication({ logger: ['error'] });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  // Listen once: supertest would otherwise open a new server port for every request, and thousands of
  // requests exhaust the Windows ephemeral ports (connections, PostgreSQL ones included, get reset).
  await app.listen(0, '127.0.0.1');
  // main.ts provisions the platform account at boot; do the same here (idempotent)
  await app.get(SuperAdminInitService, { strict: false }).initSuperAdmin();

  return {
    app,
    prisma: app.get(PrismaService),
    push,
    runJob: (processor, name, instituteId, data) =>
      app.get(processor, { strict: false }).process({ name, data: { instituteId, userId: 0, ...data } } as Job),
    // Domain events finish after their response: let them drain before closing the pool
    close: async () => {
      await new Promise((r) => setTimeout(r, 300));
      await app.close();
    },
  };
}
