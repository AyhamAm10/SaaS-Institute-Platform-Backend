import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/errors/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Global API prefix
  const prefix = process.env['API_PREFIX'] ?? 'api';
  app.setGlobalPrefix(prefix);

  // Global validation pipe — validates DTOs at the API boundary
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true,           // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // Global exception filter — consistent error response format
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CORS
  app.enableCors();

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  logger.log(`🚀 Application running on: http://localhost:${port}/${prefix}`);
}

bootstrap();
