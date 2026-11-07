import { jest } from '@jest/globals';
import { RequestContext } from '../../context/request-context';
import { OperationalContextGuard } from './operational-context.guard';

describe('OperationalContextGuard', () => {
  const branches = { findById: jest.fn(async (id: number) => (id === 1 ? { id } : null)) };
  const years = { findById: jest.fn(async (id: number) => (id === 7 ? { id } : null)) };
  const reflector = { getAllAndOverride: jest.fn(() => false) };
  const guard = new OperationalContextGuard(branches as never, years as never, reflector as never);
  const http = { getHandler: () => undefined, getClass: () => undefined } as never;
  const run = (ctx: Record<string, unknown>) =>
    RequestContext.run({ userId: 1, instituteId: 3, role: 'INSTITUTE_ADMIN', language: 'en', ...ctx }, () =>
      guard.canActivate(http),
    );

  beforeEach(() => reflector.getAllAndOverride.mockReturnValue(false));

  it('passes without headers and with headers of the institute', async () => {
    await expect(run({})).resolves.toBe(true);
    await expect(run({ branchId: 1, academicYearId: 7 })).resolves.toBe(true);
  });

  it('refuses a branch or a year of another institute with 400', async () => {
    await expect(run({ branchId: 99 })).rejects.toMatchObject({ status: 400 });
    await expect(run({ academicYearId: 99 })).rejects.toMatchObject({ status: 400 });
  });

  it('skips public routes, the super admin and unauthenticated requests', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(run({ branchId: 99 })).resolves.toBe(true);
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(run({ branchId: 99, role: 'SUPER_ADMIN' })).resolves.toBe(true);
    await expect(run({ branchId: 99, instituteId: 0 })).resolves.toBe(true);
  });
});
