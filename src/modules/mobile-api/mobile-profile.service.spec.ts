import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { MobileProfileService } from './mobile-profile.service';

const childRow = {
  id: 1,
  fullName: 'Ali',
  gender: 'MALE',
  birthDate: new Date('2012-05-04T00:00:00Z'),
  branchId: 1,
  branch: { id: 1, name: 'Main' },
  status: null,
  bus: { id: 1, name: 'Bus 1', driverName: '', driverPhone: '0944' },
  family: { id: 10, familyName: 'Haddad', phone: '' },
  studentEnrollments: [],
};

describe('MobileProfileService', () => {
  let access: any;
  let fees: any;
  let institute: any;
  let service: MobileProfileService;

  const run = <T>(fn: () => Promise<T>, role = 'FAMILY') =>
    RequestContext.run({ userId: 7, instituteId: 3, role, language: 'en' }, fn);

  beforeEach(() => {
    access = {
      caller: jest.fn(async () => ({ userId: 7, role: 'FAMILY', fullName: 'Parent', phone: '0911' })),
      children: jest.fn(async () => [childRow]),
      child: jest.fn(async () => childRow),
    };
    fees = { getStudentFinance: jest.fn(async () => ({ totals: [], contracts: [], payments: [], nextDue: null })) };
    institute = {
      getProfile: jest.fn(async () => ({
        id: 3, name: 'Inst', logoUrl: '', primaryColor: '#111', secondaryColor: '', phone: '0111', address: '',
      })),
    };
    const context = { runFor: jest.fn(async (_c: unknown, fn: any) => fn({})) };
    service = new MobileProfileService(access, context as any, institute, fees);
  });

  it('/me: blank institute columns become null, student without section has section null', async () => {
    const me = await run(() => service.getMe());
    expect(me.institute.logoUrl).toBeNull();
    expect(me.institute.secondaryColor).toBeNull();
    expect(me.institute.address).toBeNull();
    expect(me.children[0].section).toBeNull();
    expect(me.children[0].statusName).toBeNull();
  });

  it('finance: a STUDENT is refused (403) before any lookup', async () => {
    access.caller.mockResolvedValue({ userId: 7, role: 'STUDENT', fullName: 'S', phone: '1' });
    await expect(run(() => service.getFinance(1), 'STUDENT')).rejects.toThrow(ForbiddenException);
    expect(access.child).not.toHaveBeenCalled();
    expect(fees.getStudentFinance).not.toHaveBeenCalled();
  });

  it('finance: a guardian gets the empty shape for a child without contracts', async () => {
    const finance = await run(() => service.getFinance(1));
    expect(finance).toEqual({ totals: [], contracts: [], payments: [] });
  });

  it('profile: family block only for guardians, blank values null', async () => {
    const asFamily = await run(() => service.getProfile(1));
    expect(asFamily.family).toEqual({ familyName: 'Haddad', phone: null });
    expect(asFamily.bus).toEqual({ name: 'Bus 1', driverName: null, driverPhone: '0944' });
    expect(asFamily.birthDate).toBe('2012-05-04');

    access.caller.mockResolvedValue({ userId: 7, role: 'STUDENT', fullName: 'S', phone: '1' });
    const asStudent = await run(() => service.getProfile(1), 'STUDENT');
    expect(asStudent.family).toBeNull();
  });
});
