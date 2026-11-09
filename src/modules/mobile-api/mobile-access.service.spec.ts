import { jest } from '@jest/globals';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { MobileAccessService } from './mobile-access.service';

const row = (id: number) => ({
  id,
  fullName: `Student ${id}`,
  branchId: 1,
  studentEnrollments: [],
});

describe('MobileAccessService (ownership)', () => {
  let accounts: any;
  let students: any;
  let context: any;
  let service: MobileAccessService;

  const as = (role: string, fn: () => Promise<unknown>) =>
    RequestContext.run(
      { userId: 7, instituteId: 3, role, language: 'en', branchId: 99, academicYearId: 88 },
      fn,
    );

  beforeEach(() => {
    accounts = {
      getActiveAccount: jest.fn(async () => ({ id: 7, fullName: 'Parent', phone: '0911', role: 'FAMILY' })),
      getGuardianFamilyIds: jest.fn(async () => [10, 11]),
    };
    // Mimics the repository: only the rows the owner filter allows
    students = {
      findForMobile: jest.fn(async (owner: any, id?: number) => {
        const mine = owner.familyIds ? [row(1), row(2)] : [row(5)];
        return id === undefined ? mine : mine.filter((s) => s.id === id);
      }),
    };
    context = { runNeutral: jest.fn((fn: () => unknown) => fn()) };
    service = new MobileAccessService(accounts, students, context);
  });

  it('guardian: lists the children of every linked family', async () => {
    const children = await as('FAMILY', async () => service.children(await service.caller()));
    expect((children as any[]).map((c) => c.id)).toEqual([1, 2]);
    expect(students.findForMobile).toHaveBeenCalledWith({ familyIds: [10, 11] }, undefined);
  });

  it('guardian: own child is served', async () => {
    const child = await as('FAMILY', async () => service.child(await service.caller(), 2));
    expect((child as any).id).toBe(2);
  });

  it("guardian: another family's child is a 404", async () => {
    await expect(
      as('FAMILY', async () => service.child(await service.caller(), 999)),
    ).rejects.toThrow(NotFoundException);
  });

  it('guardian without a family link sees nothing (404)', async () => {
    accounts.getGuardianFamilyIds.mockResolvedValue([]);
    students.findForMobile.mockResolvedValue([]);
    await expect(
      as('FAMILY', async () => service.child(await service.caller(), 1)),
    ).rejects.toThrow(NotFoundException);
  });

  it('student: only the record linked to their own user', async () => {
    accounts.getActiveAccount.mockResolvedValue({ id: 7, fullName: 'S', phone: '0922', role: 'STUDENT' });
    const mine = await as('STUDENT', async () => service.child(await service.caller(), 5));
    expect((mine as any).id).toBe(5);
    expect(students.findForMobile).toHaveBeenCalledWith({ userId: 7 }, 5);
    await expect(
      as('STUDENT', async () => service.child(await service.caller(), 1)),
    ).rejects.toThrow(NotFoundException);
  });

  it('deactivated account (soft-deleted user) is refused with 401', async () => {
    accounts.getActiveAccount.mockRejectedValue(new UnauthorizedException());
    await expect(as('FAMILY', () => service.caller())).rejects.toThrow(UnauthorizedException);
  });

  it('token role that differs from the database role is refused', async () => {
    await expect(as('STUDENT', () => service.caller())).rejects.toThrow(UnauthorizedException);
  });

  it('queries run without header branch / year', async () => {
    await as('FAMILY', async () => service.children(await service.caller()));
    expect(context.runNeutral).toHaveBeenCalled();
  });
});
