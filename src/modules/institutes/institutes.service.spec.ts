import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InstitutesService } from './institutes.service';
import { InstituteRepository } from './institute.repository';
import { UserSystemRepository } from '../users/user-system.repository';
import { AcademicBranchesService } from '../academic-branches/academic-branches.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { CreateInstituteDto } from './dto/create-institute.dto';
import { UserRole } from '../../common/types/user-role.enum';

describe('InstitutesService', () => {
  let service: InstitutesService;
  let mockInstituteRepo: any;
  let mockUserSystemRepo: any;
  let mockAcademicBranchesService: any;
  let mockTransactionHelper: any;

  beforeEach(() => {
    mockInstituteRepo = {
      create: jest.fn() as any,
      createAdminLink: jest.fn() as any,
      findById: jest.fn() as any,
      findByIdWithAdmins: jest.fn() as any,
      findManyPaginated: jest.fn() as any,
    };

    mockUserSystemRepo = {
      findByPhone: jest.fn() as any,
      create: jest.fn() as any,
    };

    mockAcademicBranchesService = {
      provisionDefaultBranches: (jest.fn() as any).mockResolvedValue([]),
    };

    // Execute callback directly for transactions
    mockTransactionHelper = {
      executeInTransaction: (jest.fn() as any).mockImplementation((cb: () => Promise<unknown>) => cb()),
    };

    service = new InstitutesService(
      mockInstituteRepo as InstituteRepository,
      mockUserSystemRepo as UserSystemRepository,
      mockAcademicBranchesService as AcademicBranchesService,
      mockTransactionHelper as TransactionHelper,
    );
  });

  const validDto: CreateInstituteDto = {
    name: 'Al-Amal School',
    logoUrl: 'https://example.com/logo.png',
    primaryColor: '#0055ff',
    secondaryColor: '#ffbb00',
    phone: '+966500000099',
    address: 'Dammam, KSA',
    adminFullName: 'Director Saleh',
    adminPhone: '+966599999999',
    adminPassword: 'Password123!',
  };

  describe('createInstitute', () => {
    it('throws ConflictException if admin phone is already registered', async () => {
      mockUserSystemRepo.findByPhone.mockResolvedValue({
        id: 1,
        phone: validDto.adminPhone,
      });

      await expect(service.createInstitute(validDto)).rejects.toThrow(ConflictException);
      expect(mockInstituteRepo.create).not.toHaveBeenCalled();
    });

    it('atomically creates institute, admin user, and admin link', async () => {
      mockUserSystemRepo.findByPhone.mockResolvedValue(null);

      const createdInstitute = {
        id: 10,
        name: validDto.name,
        logoUrl: validDto.logoUrl,
        primaryColor: validDto.primaryColor,
        secondaryColor: validDto.secondaryColor,
        phone: validDto.phone,
        address: validDto.address,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdUser = {
        id: 25,
        instituteId: 10,
        fullName: validDto.adminFullName,
        phone: validDto.adminPhone,
        passwordHash: 'hashed_password',
        role: UserRole.INSTITUTE_ADMIN,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInstituteRepo.create.mockResolvedValue(createdInstitute);
      mockUserSystemRepo.create.mockResolvedValue(createdUser);
      mockInstituteRepo.createAdminLink.mockResolvedValue({ id: 1, instituteId: 10, userId: 25 });

      const result = await service.createInstitute(validDto);

      expect(mockTransactionHelper.executeInTransaction).toHaveBeenCalled();
      expect(mockInstituteRepo.create).toHaveBeenCalledWith({
        name: validDto.name,
        logoUrl: validDto.logoUrl,
        primaryColor: validDto.primaryColor,
        secondaryColor: validDto.secondaryColor,
        phone: validDto.phone,
        address: validDto.address,
      });

      expect(mockUserSystemRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          instituteId: 10,
          fullName: validDto.adminFullName,
          phone: validDto.adminPhone,
          role: UserRole.INSTITUTE_ADMIN,
        }),
      );

      expect(mockInstituteRepo.createAdminLink).toHaveBeenCalledWith(10, 25);
      expect(mockAcademicBranchesService.provisionDefaultBranches).toHaveBeenCalledWith(10);
      expect(result.institute).toEqual(createdInstitute);
      expect(result.admin.id).toBe(25);
      expect(result.admin.role).toBe(UserRole.INSTITUTE_ADMIN);
      expect((result.admin as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('returns the institute when found', async () => {
      const institute = { id: 10, name: 'Al-Amal' };
      mockInstituteRepo.findByIdWithAdmins.mockResolvedValue(institute);

      const result = await service.findById(10);
      expect(result).toEqual(institute);
    });

    it('throws NotFoundException when institute does not exist', async () => {
      mockInstituteRepo.findByIdWithAdmins.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });
});
