import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContext, RequestContextData } from './request-context';
import { ClientType } from '../common/types/client-type.enum';

/**
 * Middleware that initializes the AsyncLocalStorage context for every request.
 *
 * Sets the language from the Accept-Language header and clientType from X-Client-Type.
 * User and institute data are populated later by the JwtAuthGuard (after JWT verification).
 *
 * The middleware wraps `next()` inside `RequestContext.run()` so all subsequent
 * middleware, guards, interceptors, and handlers share the same async context.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const language = this.extractLanguage(req);
    const clientType = this.extractClientType(req);
    const branchId = this.extractNumericHeader(req, 'x-branch-id');
    const academicYearId =
      this.extractNumericHeader(req, 'x-academic-year-id') ??
      this.extractNumericHeader(req, 'x-year-id');

    const context: RequestContextData = {
      userId: 0,
      instituteId: 0,
      role: '',
      language,
      clientType,
      branchId,
      academicYearId,
    };

    RequestContext.run(context, () => next());
  }

  private extractNumericHeader(
    req: Request,
    headerName: string,
  ): number | undefined {
    const raw = req.headers[headerName];
    if (!raw) return undefined;
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!value) return undefined;
    const num = Number(value);
    return !isNaN(num) && num > 0 ? num : undefined;
  }

  private extractClientType(req: Request): ClientType | undefined {
    const raw = req.headers['x-client-type'];
    if (!raw) return undefined;
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
    return value === ClientType.WEB || value === ClientType.MOBILE
      ? (value as ClientType)
      : undefined;
  }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'en';

    // Parse the primary language tag (e.g., "ar-SA,ar;q=0.9" → "ar")
    const primaryLanguage = acceptLanguage.split(',')[0]?.split('-')[0]?.trim();
    return primaryLanguage || 'en';
  }
}
