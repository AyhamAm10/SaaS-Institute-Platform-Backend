import { jest } from '@jest/globals';
import { RequestContext } from '../../context/request-context';
import { UserSystemRepository } from '../users/user-system.repository';
import { UserRepository } from '../users/user.repository';
import { StaffRepository } from '../staff/staff.repository';
import { MobileAccountsRepository } from '../mobile-accounts/mobile-accounts.repository';
import { TeacherRepository } from '../teachers/teacher.repository';
import { AccountsRepository } from './accounts.repository';

/**
 * Audit of the "active accounts only" rule: every read behind sign-in, refresh,
 * the mobile guards and the staff / teacher lists carries `isActive: true`.
 * The only reads that may see deactivated accounts are the phone-uniqueness
 * check (the phone stays taken), the login lookup (it must tell a deactivated
 * account from a wrong password, after the password matched) and the accounts
 * screen itself (it exists to switch them back on).
 */
const ctx = { userId: 1, instituteId: 3, role: 'INSTITUTE_ADMIN', language: 'en' };
const inCtx = <T>(fn: () => Promise<T>) => RequestContext.run(ctx, fn);

const userModel = () => ({
  findFirst: jest.fn<any>().mockResolvedValue(null),
  findUnique: jest.fn<any>().mockResolvedValue(null),
  findMany: jest.fn<any>().mockResolvedValue([]),
  count: jest.fn<any>().mockResolvedValue(0),
});

const whereOf = (fn: { mock: { calls: any[][] } }) => fn.mock.calls[0][0].where;

describe('active-accounts filter on user reads', () => {
  it('refresh / profile lookup refuses an inactive user', async () => {
    const user = userModel();
    await new UserSystemRepository({ user } as never).findByIdWithInstitute(9);
    expect(whereOf(user.findUnique)).toMatchObject({ isActive: true, deletedAt: null });
  });

  it('tenant profile lookup refuses an inactive user', async () => {
    const user = userModel();
    await inCtx(() => new UserRepository({ user } as never).findByIdWithInstitute(9));
    expect(whereOf(user.findFirst)).toMatchObject({ isActive: true });
  });

  it('the mobile guard reads active FAMILY / STUDENT users only', async () => {
    const user = userModel();
    await inCtx(() => new MobileAccountsRepository({ user } as never).findActiveAccount(9));
    expect(whereOf(user.findFirst)).toMatchObject({ isActive: true, instituteId: 3 });
  });

  it('the staff list, a staff lookup and the admin count read active users only', async () => {
    const user = userModel();
    const repo = new StaffRepository({ user } as never);
    await inCtx(() => repo.findStaff({ page: 1, limit: 10 } as never));
    expect(whereOf(user.findMany)).toMatchObject({ isActive: true });
    await inCtx(() => repo.findStaffById(4));
    expect(whereOf(user.findFirst)).toMatchObject({ isActive: true });
    await inCtx(() => repo.countActiveAdmins());
    expect(user.count.mock.calls.at(-1)![0].where).toMatchObject({
      isActive: true,
      role: 'INSTITUTE_ADMIN',
    });
  });

  it('the teacher list shows active teachers unless the inactive ones are asked for', async () => {
    const teacher = {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    };
    const repo = new TeacherRepository({ teacher } as never);
    await inCtx(() => repo.findAllFiltered({ page: 1, limit: 10 } as never));
    expect(whereOf(teacher.findMany)).toMatchObject({ isActive: true });
    teacher.findMany.mockClear();
    await inCtx(() =>
      repo.findAllFiltered({ page: 1, limit: 10, isActive: false } as never),
    );
    expect(whereOf(teacher.findMany)).toMatchObject({ isActive: false });
  });

  it('the accounts screen is the one list that can show inactive accounts', async () => {
    const user = { ...userModel(), update: jest.fn<any>() };
    await inCtx(() =>
      new AccountsRepository({ user } as never).list({
        type: 'teachers',
        page: 1,
        limit: 10,
      } as never),
    );
    expect(whereOf(user.findMany)).not.toHaveProperty('isActive');
    user.findMany.mockClear();
    await inCtx(() =>
      new AccountsRepository({ user } as never).list({
        type: 'teachers',
        status: 'inactive',
        page: 1,
        limit: 10,
      } as never),
    );
    expect(whereOf(user.findMany)).toMatchObject({ isActive: false });
  });
});
