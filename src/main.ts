import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/errors/http-exception.filter';
import { SuperAdminInitService } from './modules/users/super-admin-init.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Parse cookies from incoming requests
  app.use(cookieParser());

  // Global API prefix
  const prefix = process.env['API_PREFIX'] ?? 'api';
  app.setGlobalPrefix(prefix);

  // Global validation pipe — validates DTOs at the API boundary
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // Global exception filter — consistent error response format
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CORS — allow credentials for Web cookie delivery
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // API docs (Swagger UI) — development only, at /<prefix>/docs
  if (process.env['NODE_ENV'] !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Institute Platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('access_token')
      .addGlobalParameters(
        { name: 'X-Branch-Id', in: 'header', required: false },
        { name: 'X-Academic-Year-Id', in: 'header', required: false },
        { name: 'Accept-Language', in: 'header', required: false },
      )
      .build();
    SwaggerModule.setup(`${prefix}/docs`, app, () =>
      SwaggerModule.createDocument(app, config),
    );
  }

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  logger.log(`🚀 Application running on: http://localhost:${port}/${prefix}`);
  if (process.env['NODE_ENV'] !== 'production') {
    logger.log(`📚 API docs: http://localhost:${port}/${prefix}/docs`);
  }

  // Ensure Super Admin user exists after server startup and database connection
  const superAdminInitService = app.get(SuperAdminInitService);
  await superAdminInitService.initSuperAdmin();
}

bootstrap();
