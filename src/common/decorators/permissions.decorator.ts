import { SetMetadata } from '@nestjs/common';
import { Permission, Resource } from '../types/permissions';

export const RESOURCE_KEY = 'resource';
export const PERMISSIONS_KEY = 'permissions';

/**
 * Declares the resource of a controller (or route). PermissionsGuard requires
 * `<resource>.view` for GET / HEAD and `<resource>.manage` otherwise.
 *
 * Usage: `@RequireResource(Resource.Fees)` on the controller class.
 */
export const RequireResource = (resource: Resource) =>
  SetMetadata(RESOURCE_KEY, resource);

/**
 * Explicit permission(s) of one route, overriding the resource rule
 * (any of them is enough). Example: entering marks needs `marks.enter`.
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
