import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { MobileApiController } from './mobile-api.controller';

/** The global guards, run against the real controller metadata. */
describe('MobileApiController access', () => {
  const contextFor = (role: string, handler: keyof MobileApiController): ExecutionContext =>
    ({
      getHandler: () => MobileApiController.prototype[handler],
      getClass: () => MobileApiController,
      switchToHttp: () => ({ getRequest: () => ({ method: 'GET', user: { id: 1, instituteId: 1, role } }) }),
    }) as unknown as ExecutionContext;

  const handlers: (keyof MobileApiController)[] = [
    'me',
    'getOverview',
    'getAttendance',
    'getTimetable',
    'getResults',
    'getFinance',
    'getProfile',
  ];

  it.each(['FAMILY', 'STUDENT'])('%s passes the role and permission guards on every route', (role) => {
    for (const handler of handlers) {
      expect(new RolesGuard().canActivate(contextFor(role, handler))).toBe(true);
      expect(new PermissionsGuard().canActivate(contextFor(role, handler))).toBe(true);
    }
  });

  it.each(['INSTITUTE_ADMIN', 'REGISTRAR', 'ACCOUNTANT', 'TEACHER'])(
    'staff role %s is refused',
    (role) => {
      expect(() => new RolesGuard().canActivate(contextFor(role, 'me'))).toThrow(ForbiddenException);
    },
  );
});
