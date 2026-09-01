import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestContextMiddleware } from './request-context.middleware';

/**
 * Global module that applies the RequestContextMiddleware to all routes.
 * This ensures every request has an AsyncLocalStorage context available.
 */
@Global()
@Module({})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
