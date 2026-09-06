import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../types/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Decorator to enforce required user role(s) on controllers or individual endpoints.
 *
 * Usage:
 *   @Roles(UserRole.SUPER_ADMIN)
 *   @Roles(UserRole.INSTITUTE_ADMIN, UserRole.TEACHER)
 */
export const Roles = (...roles: (UserRole | string)[]) =>
  SetMetadata(ROLES_KEY, roles);
