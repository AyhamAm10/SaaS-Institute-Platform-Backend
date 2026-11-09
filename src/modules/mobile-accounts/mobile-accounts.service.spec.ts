import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { MobileAccountsService } from './mobile-accounts.service';
import { GuardianRelationship } from '@prisma/client';

describe('MobileAccountsService', () => {
  const ctx = {
    userId: 1,
    instituteId: 3,
    role: 'INSTITUTE_ADMIN',
    language: 'en',
  };

  let service: MobileAccountsService;
  let repo: any;
  let familyRepo: any;
  let studentRepo: any;
  let authService: any;
  let txHelper: any;

  beforeEach(() => {
    repo = {
      findAccounts: jest.fn(async () => ({ data: [], total: 0 })),
      findStudentsWithoutAccount: jest.fn(async () => []),
      findByPhone: jest.fn(async () => null),
      findMobileUserById: jest.fn(async (id: number) => ({
        id,
        fullName: 'ولي أمر تجريبي',
        phone: '0912345678',
        role: 'FAMILY',
        deletedAt: null,
      })),
      getAccountById: jest.fn(async (id: number) => ({
        id,
        fullName: 'ولي أمر تجريبي',
        phone: '0912345678',
        role: 'FAMILY',
        status: 'ACTIVE',
        createdAt: new Date(),
      })),
      createGuardianAccount: jest.fn(async () => 10),
      createStudentAccount: jest.fn(async () => 20),
      update: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
      getInstituteId: jest.fn(() => 3),
    };

    familyRepo = {
      findFamilyById: jest.fn(async (id: number) => ({
        id,
        familyName: 'العمر',
      })),
    };

    studentRepo = {
      findStudentById: jest.fn(async (id: number) => ({
        id,
        fullName: 'طالب تجريبي',
        userId: null,
      })),
    };

    authService = {
      logout: jest.fn(async () => undefined),
    };

    txHelper = {
      executeInTransaction: jest.fn(async (fn: any) => fn()),
    };

    service = new MobileAccountsService(
      repo,
      familyRepo,
      studentRepo,
      authService,
      txHelper,
    );
  });

  it('delegates findAll to repository', async () => {
    await RequestContext.run(ctx, () =>
      service.findAll({ page: 1, limit: 10 }),
    );
    expect(repo.findAccounts).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('delegates findEligibleStudents to repository', async () => {
    await RequestContext.run(ctx, () =>
      service.findEligibleStudents('أحمد'),
    );
    expect(repo.findStudentsWithoutAccount).toHaveBeenCalledWith('أحمد');
  });

  describe('createGuardian', () => {
    const dto = {
      familyId: 1,
      fullName: 'خالد العمر',
      phone: '0911223344',
      relationship: GuardianRelationship.FATHER,
      password: 'StrongPassword123!',
    };

    it('creates guardian account successfully', async () => {
      const result = await RequestContext.run(ctx, () =>
        service.createGuardian(dto),
      );
      expect(familyRepo.findFamilyById).toHaveBeenCalledWith(1);
      expect(repo.findByPhone).toHaveBeenCalledWith('0911223344');
      expect(repo.createGuardianAccount).toHaveBeenCalled();
      expect(result.id).toBe(10);
    });

    it('throws NotFoundException when family does not exist', async () => {
      familyRepo.findFamilyById.mockResolvedValueOnce(null);
      await expect(
        RequestContext.run(ctx, () => service.createGuardian(dto)),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when phone is duplicate in institute', async () => {
      repo.findByPhone.mockResolvedValueOnce({ id: 99, phone: '0911223344' });
      await expect(
        RequestContext.run(ctx, () => service.createGuardian(dto)),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createStudent', () => {
    const dto = {
      studentId: 5,
      phone: '0955667788',
      password: 'StrongPassword123!',
    };

    it('creates student account successfully', async () => {
      const result = await RequestContext.run(ctx, () =>
        service.createStudent(dto),
      );
      expect(studentRepo.findStudentById).toHaveBeenCalledWith(5);
      expect(repo.createStudentAccount).toHaveBeenCalled();
      expect(result.id).toBe(20);
    });

    it('throws NotFoundException when student does not exist', async () => {
      studentRepo.findStudentById.mockResolvedValueOnce(null);
      await expect(
        RequestContext.run(ctx, () => service.createStudent(dto)),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when student already has an active account', async () => {
      studentRepo.findStudentById.mockResolvedValueOnce({
        id: 5,
        fullName: 'طالب مكرر',
        userId: 15,
      });
      repo.findMobileUserById.mockResolvedValueOnce({
        id: 15,
        deletedAt: null,
      });

      await expect(
        RequestContext.run(ctx, () => service.createStudent(dto)),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when phone is duplicate in institute', async () => {
      repo.findByPhone.mockResolvedValueOnce({ id: 99, phone: '0955667788' });
      await expect(
        RequestContext.run(ctx, () => service.createStudent(dto)),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resetPassword', () => {
    it('resets password and logs user out of all sessions', async () => {
      const result = await RequestContext.run(ctx, () =>
        service.resetPassword(10, { password: 'NewPassword123!' }),
      );
      expect(repo.update).toHaveBeenCalledWith(10, expect.any(Object));
      expect(authService.logout).toHaveBeenCalledWith(10);
      expect(result.updated).toBe(true);
    });

    it('throws NotFoundException if user does not exist', async () => {
      repo.findMobileUserById.mockResolvedValueOnce(null);
      await expect(
        RequestContext.run(ctx, () =>
          service.resetPassword(999, { password: 'NewPassword123!' }),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('deactivates account and logs out sessions', async () => {
      const result = await RequestContext.run(ctx, () =>
        service.deactivate(10),
      );
      expect(repo.delete).toHaveBeenCalledWith(10);
      expect(authService.logout).toHaveBeenCalledWith(10);
      expect(result.deactivated).toBe(true);
    });

    it('throws NotFoundException if user does not exist', async () => {
      repo.findMobileUserById.mockResolvedValueOnce(null);
      await expect(
        RequestContext.run(ctx, () => service.deactivate(999)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('active account (mobile API)', () => {
    it('returns the live account', async () => {
      repo.findActiveAccount = jest.fn(async () => ({ id: 4, fullName: 'P', phone: '0911', role: 'FAMILY' }));
      const account = await RequestContext.run(ctx, () => service.getActiveAccount(4));
      expect(account).toEqual({ id: 4, fullName: 'P', phone: '0911', role: 'FAMILY' });
    });

    it('a deactivated or unknown account is a 401', async () => {
      repo.findActiveAccount = jest.fn(async () => null);
      await expect(
        RequestContext.run(ctx, () => service.getActiveAccount(4)),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
