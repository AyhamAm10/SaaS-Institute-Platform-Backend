import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtTokenService } from '../jwt-token.service';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { RequestContext } from '../../../context/request-context';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';

/**
 * Global JWT authentication guard.
 *
 * Applied to ALL routes via APP_GUARD. Routes decorated with @Public()
 * bypass authentication.
 *
 * Flow:
 *   1. Check if route is @Public() → skip auth
 *   2. Extract Bearer token from Authorization header
 *   3. Verify token via JwtTokenService
 *   4. Set user on request object (for @CurrentUser() decorator)
 *   5. Update AsyncLocalStorage context (for repositories/services)
 *
 * No database lookup is performed — the JWT payload is trusted for the
 * duration of the access token (short-lived, typically 15min).
 * User validity is re-checked during token refresh.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if the route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      const payload = this.jwtTokenService.verifyAccessToken(token);

      // Set the authenticated user on the request (for @CurrentUser() decorator)
      const authenticatedUser: AuthenticatedUser = {
        id: payload.sub,
        instituteId: payload.instituteId,
        role: payload.role,
      };

      // Attach user to request
      (request as Request & { user: AuthenticatedUser }).user = authenticatedUser;

      // Update the AsyncLocalStorage context (for repositories and services)
      const ctx = RequestContext.get();
      if (ctx) {
        ctx.userId = payload.sub;
        ctx.instituteId = payload.instituteId;
        ctx.role = payload.role;
      }

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (!authorization) return undefined;

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
