import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffRepository } from './staff.repository';
import { AuthService } from '../auth/auth.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { RequestContext } from '../../context/request-context';
import { TeacherScopeService } from '../sections/teacher-scope.service';
import { TeacherRepository } from '../teachers/teacher.repository';
import { SectionSubjectRepository } from '../sections/section-subject.repository';

const member = (id: number, role = 'REGISTRAR') => ({
  id,
  fullName: 'موظف',
  phone: '09' + id,
  role,
  createdAt: new Date(),
});

describe('StaffService', () => {
  let service: StaffService;
  let repo: any;
  let auth: any;

  beforeEach(async () => {
    repo = {
      findStaffById: jest
        .fn<any>()
        .mockImplementation(async (id: number) => member(id)),
      findByPhone: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 5 }),
      update: jest.fn(),
      delete: jest.fn(),
      countActiveAdmins: jest.fn<any>().mockResolvedValue(2),
      syncAdminLink: jest.fn(),
    };
    auth = { logout: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: StaffRepository, useValue: repo },
        { provide: AuthService, useValue: auth },
        {
          provide: TransactionHelper,
          useValue: { executeInTransaction: (fn: () => unknown) => fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(StaffService);
    jest.spyOn(RequestContext, 'getUserId').mockReturnValue(1);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates an account with a hashed password and the admin link', async () => {
    await service.create({
      fullName: ' مدير ',
      phone: ' 0911 ',
      role: 'INSTITUTE_ADMIN' as never,
      password: 'secret-123',
    });
    const data = repo.create.mock.calls[0][0];
    expect(data.fullName).toBe('مدير');
    expect(data.phone).toBe('0911');
    expect(data.passwordHash).not.toBe('secret-123');
    expect(repo.syncAdminLink).toHaveBeenCalledWith(5, true);
  });

  it('refuses a phone already used in the institute', async () => {
    repo.findByPhone.mockResolvedValue({ id: 9 });
    await expect(
      service.create({
        fullName: 'x',
        phone: '0911',
        role: 'ACCOUNTANT' as never,
        password: 'secret-123',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses changing your own role or deactivating yourself', async () => {
    await expect(
      service.update(1, { role: 'ACCOUNTANT' as never }),
    ).rejects.toThrow(BadRequestException);
    await expect(service.deactivate(1)).rejects.toThrow(BadRequestException);
  });

  it('keeps at least one active admin', async () => {
    repo.findStaffById.mockResolvedValue(member(7, 'INSTITUTE_ADMIN'));
    repo.countActiveAdmins.mockResolvedValue(1);
    await expect(service.deactivate(7)).rejects.toThrow(BadRequestException);
    await expect(
      service.update(7, { role: 'REGISTRAR' as never }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('signs the person out after a role change, a password reset or deactivation', async () => {
    await service.update(7, { role: 'ACCOUNTANT' as never });
    expect(repo.syncAdminLink).toHaveBeenCalledWith(7, false);
    await service.resetPassword(7, { password: 'new-secret-1' });
    await service.deactivate(7);
    expect(auth.logout).toHaveBeenCalledTimes(3);
    expect(repo.delete).toHaveBeenCalledWith(7);
  });

  it('does not sign out on a name-only change', async () => {
    await service.update(7, { fullName: 'اسم جديد' });
    expect(auth.logout).not.toHaveBeenCalled();
  });
});

describe('TeacherScopeService', () => {
  const build = async (role: string) => {
    jest.spyOn(RequestContext, 'get').mockReturnValue({ role } as never);
    jest.spyOn(RequestContext, 'getUserId').mockReturnValue(3);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeacherScopeService,
        {
          provide: TeacherRepository,
          useValue: {
            findByUserId: jest.fn<any>().mockResolvedValue({ id: 40 }),
          },
        },
        {
          provide: SectionSubjectRepository,
          useValue: {
            findMany: jest.fn<any>().mockResolvedValue([
              { sectionId: 1, subjectId: 2 },
              { sectionId: 1, subjectId: 3 },
              { sectionId: 4, subjectId: 2 },
            ]),
          },
        },
      ],
    }).compile();
    return moduleRef.get(TeacherScopeService);
  };

  afterEach(() => jest.restoreAllMocks());

  it('does not restrict other roles', async () => {
    const scope = await build('INSTITUTE_ADMIN');
    expect(await scope.taughtPairs()).toBeNull();
    await expect(scope.assertTeachesSection(99)).resolves.toBeUndefined();
  });

  it('limits a teacher to the sections and subjects assigned to them', async () => {
    const scope = await build('TEACHER');
    expect(await scope.taughtSectionIds()).toEqual([1, 4]);
    await expect(scope.assertTeachesSubject(1, 3)).resolves.toBeUndefined();
    await expect(scope.assertTeachesSubject(4, 3)).rejects.toThrow();
    await expect(scope.assertTeachesSection(2)).rejects.toThrow();
  });
});
