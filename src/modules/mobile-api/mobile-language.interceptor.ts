import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { RequestContext } from '../../context/request-context';

/**
 * The apps are Arabic-first: without an `Accept-Language` header the error
 * messages of `/mobile` are Arabic (everywhere else the default stays English).
 */
@Injectable()
export class MobileLanguageInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const ctx = RequestContext.get();
    if (ctx && !request.headers['accept-language']) ctx.language = 'ar';
    return next.handle();
  }
}
