import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import {
  actionForMethod,
  DASHBOARD_ROLES,
  hasPermission,
  MARKS_ENTER,
  permissionsOf,
  Resource,
} from '../../../common/types/permissions';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import {
  PERMISSIONS_KEY,
  RESOURCE_KEY,
} from '../../../common/decorators/permissions.decorator';

describe('permission map', () => {
  it('gives admins everything', () => {
    expect(hasPermission('INSTITUTE_ADMIN', 'staff.manage')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', MARKS_ENTER)).toBe(true);
  });

  it('keeps every staff role to its own area', () => {
    // Registrar: students & attendance, reads finance, never manages it
    expect(hasPermission('REGISTRAR', 'students.manage')).toBe(true);
    expect(hasPermission('REGISTRAR', 'fees.view')).toBe(true);
    expect(hasPermission('REGISTRAR', 'fees.manage')).toBe(false);
    // Accountant: finance only
    expect(hasPermission('ACCOUNTANT', 'fees.manage')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'students.manage')).toBe(false);
    expect(hasPermission('ACCOUNTANT', 'attendance.manage')).toBe(false);
    // Teacher: marks + attendance, no exam management, no dashboard
    expect(hasPermission('TEACHER', MARKS_ENTER)).toBe(true);
    expect(hasPermission('TEACHER', 'exams.manage')).toBe(false);
    expect(hasPermission('TEACHER', 'dashboard.view')).toBe(false);
    // Nobody but admins manages staff
    for (const role of ['REGISTRAR', 'ACCOUNTANT', 'TEACHER']) {
      expect(hasPermission(role, 'staff.manage')).toBe(false);
    }
  });

  it('has no permission for unknown roles or families / students', () => {
    expect(permissionsOf('FAMILY')).toEqual([]);
    expect(permissionsOf(undefined)).toEqual([]);
    expect(DASHBOARD_ROLES).not.toContain('FAMILY');
  });

  it('maps HTTP methods to actions', () => {
    expect(actionForMethod('GET')).toBe('view');
    expect(actionForMethod('head')).toBe('view');
    expect(actionForMethod('POST')).toBe('manage');
    expect(actionForMethod('DELETE')).toBe('manage');
  });
});

describe('PermissionsGuard', () => {
  const contextFor = (
    method: string,
    role: string,
    meta: Record<string, unknown>,
  ) => {
    const handler = () => undefined;
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => meta[key as string]);
    const context = {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ method, user: { role } }) }),
    };
    return {
      guard: new PermissionsGuard(reflector),
      context: context as never,
    };
  };

  it('requires view for GET and manage for other methods', () => {
    const meta = { [RESOURCE_KEY]: Resource.Fees };
    let t = contextFor('GET', 'REGISTRAR', meta);
    expect(t.guard.canActivate(t.context)).toBe(true);
    t = contextFor('POST', 'REGISTRAR', meta);
    expect(() => t.guard.canActivate(t.context)).toThrow(ForbiddenException);
    t = contextFor('POST', 'ACCOUNTANT', meta);
    expect(t.guard.canActivate(t.context)).toBe(true);
  });

  it('lets an explicit permission override the resource rule', () => {
    const meta = {
      [RESOURCE_KEY]: Resource.Exams,
      [PERMISSIONS_KEY]: [MARKS_ENTER],
    };
    const t = contextFor('PUT', 'TEACHER', meta);
    expect(t.guard.canActivate(t.context)).toBe(true);
  });

  it('ignores public routes and routes without metadata', () => {
    let t = contextFor('POST', 'FAMILY', { [IS_PUBLIC_KEY]: true });
    expect(t.guard.canActivate(t.context)).toBe(true);
    t = contextFor('POST', 'FAMILY', {});
    expect(t.guard.canActivate(t.context)).toBe(true);
  });
});
