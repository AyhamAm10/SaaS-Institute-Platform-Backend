import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { AccountsService } from './accounts.service';

const user = (id: number, role: string, over: Record<string, unknown> = {}) => ({
  id,
  role,
  fullName: 'اسم',
  phone: '09' + id,
  isActive: true,
  mustChangePassword: false,
  createdAt: new Date(),
  ...over,
});

describe('AccountsService', () => {
  let repo: any;
  let users: any;
  let provisioning: any;
  let familyAccounts: any;
  let students: any;
  let auth: any;
  let service: AccountsService;

  beforeEach(() => {
    repo = {
      list: jest.fn<any>().mockResolvedValue({ data: [], total: 0 }),
      findAccount: jest
        .fn<any>()
        .mockImplementation(async (id: number) => user(id, 'REGISTRAR')),
      findItem: jest.fn<any>().mockResolvedValue({ id: 7 }),
      setActive: jest.fn<any>().mockResolvedValue(undefined),
      countActiveAdmins: jest.fn<any>().mockResolvedValue(2),
      linkStudent: jest.fn<any>().mockResolvedValue(undefined),
      findStudentsWithoutAccount: jest.fn<any>().mockResolvedValue([]),
    };
    users = { findByPhone: jest.fn<any>().mockResolvedValue(null) };
    provisioning = {
      provision: jest.fn<any>().mockResolvedValue({ id: 50 }),
      resetToDefault: jest.fn<any>().mockResolvedValue(undefined),
    };
    familyAccounts = {
      syncAll: jest.fn<any>().mockResolvedValue({ created: 2 }),
      countMissing: jest.fn<any>().mockResolvedValue({ withPhone: 1, withoutPhone: 3 }),
    };
    students = {
      findStudentById: jest
        .fn<any>()
        .mockResolvedValue({ id: 11, fullName: 'طالب', userId: null }),
    };
    auth = { logout: jest.fn<any>().mockResolvedValue(undefined) };
    service = new AccountsService(
      repo,
      users,
      provisioning,
      familyAccounts,
      students,
      auth,
      { executeInTransaction: (fn: () => unknown) => fn() } as never,
    );
    jest.spyOn(RequestContext, 'getUserId').mockReturnValue(1);
  });

  afterEach(() => jest.restoreAllMocks());

  it('resets to the default password, with no password supplied, and signs the person out', async () => {
    expect(await service.resetPassword(7)).toEqual({ updated: true });
    expect(provisioning.resetToDefault).toHaveBeenCalledWith(7);
    expect(auth.logout).toHaveBeenCalledWith(7);
  });

  it('refuses to reset or deactivate your own account', async () => {
    await expect(service.resetPassword(1)).rejects.toThrow(HttpException);
    await expect(service.setActive(1, false)).rejects.toThrow(HttpException);
    expect(provisioning.resetToDefault).not.toHaveBeenCalled();
  });

  it('deactivates (reversibly) and ends the sessions', async () => {
    await service.setActive(7, false);
    expect(repo.setActive).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      false,
    );
    expect(auth.logout).toHaveBeenCalledWith(7);
  });

  it('reactivates without touching the sessions', async () => {
    await service.setActive(7, true);
    expect(repo.setActive).toHaveBeenCalledWith(expect.anything(), true);
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('keeps the last active institute admin', async () => {
    repo.findAccount.mockResolvedValue(user(7, 'INSTITUTE_ADMIN'));
    repo.countActiveAdmins.mockResolvedValue(1);
    await expect(service.setActive(7, false)).rejects.toThrow(HttpException);
    expect(repo.setActive).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown account and 403 for a super admin', async () => {
    repo.findAccount.mockResolvedValueOnce(null);
    await expect(service.resetPassword(99)).rejects.toThrow();
    repo.findAccount.mockResolvedValueOnce(user(3, 'SUPER_ADMIN'));
    await expect(service.setActive(3, false)).rejects.toThrow();
    expect(repo.setActive).not.toHaveBeenCalled();
  });

  it('creates the accounts of the families that miss one', async () => {
    expect(await service.syncFamilies()).toEqual({ created: 2 });
    expect(await service.summary()).toEqual({
      missingFamilies: { withPhone: 1, withoutPhone: 3 },
    });
  });

  describe('student account', () => {
    it('is created with the default password and linked to the student', async () => {
      await service.createStudentAccount({ studentId: 11, phone: ' 0955 ' });
      expect(provisioning.provision).toHaveBeenCalledWith({
        fullName: 'طالب',
        phone: '0955',
        role: 'STUDENT',
      });
      expect(repo.linkStudent).toHaveBeenCalledWith(11, 50);
    });

    it('refuses a student who already has one, and a phone already in use', async () => {
      students.findStudentById.mockResolvedValueOnce({ id: 11, fullName: 'ط', userId: 4 });
      await expect(
        service.createStudentAccount({ studentId: 11, phone: '0955' }),
      ).rejects.toThrow(BadRequestException);

      users.findByPhone.mockResolvedValueOnce({ id: 2 });
      await expect(
        service.createStudentAccount({ studentId: 11, phone: '0955' }),
      ).rejects.toThrow(ConflictException);
      expect(provisioning.provision).not.toHaveBeenCalled();
    });
  });
});
