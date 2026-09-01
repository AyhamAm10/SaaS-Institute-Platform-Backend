import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContext, RequestContextData } from './request-context';

/**
 * Middleware that initializes the AsyncLocalStorage context for every request.
 *
 * Sets the language from the Accept-Language header. User and institute data
 * are populated later by the JwtAuthGuard (after JWT verification).
 *
 * The middleware wraps `next()` inside `RequestContext.run()` so all subsequent
 * middleware, guards, interceptors, and handlers share the same async context.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const language = this.extractLanguage(req);

    const context: RequestContextData = {
      userId: 0,
      instituteId: 0,
      role: '',
      language,
    };

    RequestContext.run(context, () => next());
  }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'en';

    // Parse the primary language tag (e.g., "ar-SA,ar;q=0.9" → "ar")
    const primaryLanguage = acceptLanguage.split(',')[0]?.split('-')[0]?.trim();
    return primaryLanguage || 'en';
  }
}
