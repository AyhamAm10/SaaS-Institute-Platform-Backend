import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import {
  PERMISSIONS_KEY,
  RESOURCE_KEY,
} from '../../../common/decorators/permissions.decorator';
import {
  actionForMethod,
  hasPermission,
  Permission,
  permission,
  Resource,
} from '../../../common/types/permissions';
import { Ensure } from '../../../common/errors/ensure';
import { ErrorMessages } from '../../../common/errors/error-messages';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { RequestContext } from '../../../context/request-context';

/**
 * Permission guard (global, after RolesGuard).
 *
 * - `@RequirePermission(...)` on a route: any of those permissions.
 * - `@RequireResource(r)` on the controller / route: `r.view` for GET and
 *   HEAD, `r.manage` for every other method.
 * - Neither: nothing to check here (`@Roles` / public routes).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const explicit = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      targets,
    );
    const resource = this.reflector.getAllAndOverride<Resource>(
      RESOURCE_KEY,
      targets,
    );
    if (!explicit?.length && !resource) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ method: string; user?: AuthenticatedUser }>();
    const required = explicit?.length
      ? explicit
      : [permission(resource!, actionForMethod(request.method))];
    const role = request.user?.role ?? RequestContext.get()?.role;

    Ensure.forbidden(
      !required.some((p) => hasPermission(role, p)),
      ErrorMessages.get('permission_denied'),
    );
    return true;
  }
}
