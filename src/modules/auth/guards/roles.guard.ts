import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { Ensure } from '../../../common/errors/ensure';
import { ErrorMessages } from '../../../common/errors/error-messages';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { RequestContext } from '../../../context/request-context';

/**
 * Role authorization guard.
 *
 * Checks if the caller has one of the roles declared via `@Roles(...)`.
 * If no `@Roles(...)` metadata is attached, the route is accessible by any authenticated user.
 * Routes marked `@Public()` automatically bypass this guard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    // 1. Bypass if route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 2. Extract required roles
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no specific roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 3. Extract user role from request or RequestContext
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const userRole = request.user?.role ?? RequestContext.get()?.role;

    // 4. Verify role
    const hasRole = Boolean(userRole && requiredRoles.includes(userRole));
    Ensure.forbidden(!hasRole, ErrorMessages.get('forbidden'));

    return true;
  }
}
