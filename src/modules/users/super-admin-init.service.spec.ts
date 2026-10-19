import { jest } from '@jest/globals';
import { SuperAdminInitService } from './super-admin-init.service';
import { UserSystemRepository } from './user-system.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../common/types/user-role.enum';

describe('SuperAdminInitService', () => {
  let service: SuperAdminInitService;
  let userSystemRepository: jest.Mocked<UserSystemRepository>;
  let transactionHelper: jest.Mocked<TransactionHelper>;
  let configService: jest.Mocked<ConfigService>;

  const mockPhone = '0949620990';
  const mockPassword = 'a1b2c3d4321am10';

  beforeEach(() => {
    userSystemRepository = {
      findSuperAdminByPhone: jest.fn(),
      findByPhone: jest.fn(),
      update: jest.fn(),
      createSuperAdmin: jest.fn(),
      findAnyInstituteId: jest.fn(),
      createPlatformInstitute: jest.fn(),
    } as any;

    transactionHelper = {
      executeInTransaction: jest
        .fn()
        .mockImplementation(async (cb: any) => cb()),
    } as any;

    configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'SUPER_ADMIN_NUMBER') return mockPhone;
        if (key === 'SUPER_ADMIN_PASSWORD') return mockPassword;
        throw new Error(`Configuration key "${key}" does not exist`);
      }),
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SUPER_ADMIN_NAME') return 'Super Administrator';
        return undefined;
      }),
    } as any;

    service = new SuperAdminInitService(
      userSystemRepository,
      transactionHelper,
      configService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return early if super admin with matching phone already exists', async () => {
    (userSystemRepository.findSuperAdminByPhone as any).mockResolvedValue({
      id: 1,
      phone: mockPhone,
      role: UserRole.SUPER_ADMIN,
    });

    await service.initSuperAdmin();

    expect(userSystemRepository.findSuperAdminByPhone).toHaveBeenCalledWith(
      mockPhone,
    );
    expect(userSystemRepository.findByPhone).not.toHaveBeenCalled();
    expect(userSystemRepository.createSuperAdmin).not.toHaveBeenCalled();
    expect(transactionHelper.executeInTransaction).not.toHaveBeenCalled();
  });

  it('should promote user to SUPER_ADMIN if phone exists with another role', async () => {
    (userSystemRepository.findSuperAdminByPhone as any).mockResolvedValue(null);
    (userSystemRepository.findByPhone as any).mockResolvedValue({
      id: 5,
      phone: mockPhone,
      role: UserRole.INSTITUTE_ADMIN,
    });

    await service.initSuperAdmin();

    expect(userSystemRepository.findSuperAdminByPhone).toHaveBeenCalledWith(
      mockPhone,
    );
    expect(userSystemRepository.findByPhone).toHaveBeenCalledWith(mockPhone);
    expect(userSystemRepository.update).toHaveBeenCalledWith(5, {
      role: UserRole.SUPER_ADMIN,
    });
    expect(userSystemRepository.createSuperAdmin).not.toHaveBeenCalled();
  });

  it('should create super admin using existing institute when database already has an institute', async () => {
    (userSystemRepository.findSuperAdminByPhone as any).mockResolvedValue(null);
    (userSystemRepository.findByPhone as any).mockResolvedValue(null);
    (userSystemRepository.findAnyInstituteId as any).mockResolvedValue(10);
    (userSystemRepository.createSuperAdmin as any).mockResolvedValue({
      id: 1,
      phone: mockPhone,
      role: UserRole.SUPER_ADMIN,
      instituteId: 10,
    });

    await service.initSuperAdmin();

    expect(transactionHelper.executeInTransaction).toHaveBeenCalled();
    expect(userSystemRepository.findAnyInstituteId).toHaveBeenCalled();
    expect(userSystemRepository.createPlatformInstitute).not.toHaveBeenCalled();
    expect(userSystemRepository.createSuperAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Super Administrator',
        phone: mockPhone,
        instituteId: 10,
      }),
    );
  });

  it('should create root institute and super admin when database has no institute', async () => {
    (userSystemRepository.findSuperAdminByPhone as any).mockResolvedValue(null);
    (userSystemRepository.findByPhone as any).mockResolvedValue(null);
    (userSystemRepository.findAnyInstituteId as any).mockResolvedValue(null);
    (userSystemRepository.createPlatformInstitute as any).mockResolvedValue(1);
    (userSystemRepository.createSuperAdmin as any).mockResolvedValue({
      id: 1,
      phone: mockPhone,
      role: UserRole.SUPER_ADMIN,
      instituteId: 1,
    });

    await service.initSuperAdmin();

    expect(transactionHelper.executeInTransaction).toHaveBeenCalled();
    expect(userSystemRepository.findAnyInstituteId).toHaveBeenCalled();
    expect(userSystemRepository.createPlatformInstitute).toHaveBeenCalledWith(
      mockPhone,
    );
    expect(userSystemRepository.createSuperAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Super Administrator',
        phone: mockPhone,
        instituteId: 1,
      }),
    );
  });
});
