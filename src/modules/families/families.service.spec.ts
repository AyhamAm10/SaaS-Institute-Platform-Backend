import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { FamiliesService } from './families.service';
import { HttpException } from '@nestjs/common';
import { FamilyRepository } from './family.repository';
import { FamilyAccountsService } from './family-accounts.service';

describe('FamiliesService', () => {
  let service: FamiliesService;
  let repository: any;
  let accounts: any;

  const mockFamily = {
    id: 1,
    instituteId: 1,
    familyName: 'العمر',
    fatherName: 'محمد',
    motherName: 'فاطمة',
    phone: '0912345678',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      create: jest.fn(),
      search: jest.fn(),
      findFamilyById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FamiliesService,
        { provide: FamilyRepository, useValue: mockRepo },
        {
          provide: FamilyAccountsService,
          useValue: {
            ensureAccount: jest.fn().mockResolvedValue('CREATED' as never),
            rePoint: jest.fn().mockResolvedValue('CREATED' as never),
          },
        },
      ],
    }).compile();

    service = module.get<FamiliesService>(FamiliesService);
    repository = module.get(FamilyRepository);
    accounts = module.get(FamilyAccountsService);
  });

  it('creates family successfully', async () => {
    repository.create.mockResolvedValue(mockFamily);

    const result = await service.create({
      familyName: 'العمر',
      fatherName: 'محمد',
      motherName: 'فاطمة',
      phone: '0912345678',
    });

    expect(result).toEqual({ ...mockFamily, accountStatus: 'CREATED' });
    expect(accounts.ensureAccount).toHaveBeenCalledWith(mockFamily);
    expect(repository.create).toHaveBeenCalledWith({
      familyName: 'العمر',
      fatherName: 'محمد',
      motherName: 'فاطمة',
      phone: '0912345678',
    });
  });

  it('searches families successfully', async () => {
    repository.search.mockResolvedValue([mockFamily]);

    const result = await service.search('العمر');
    expect(result).toEqual([mockFamily]);
    expect(repository.search).toHaveBeenCalledWith('العمر');
  });

  it('finds family by id successfully', async () => {
    repository.findFamilyById.mockResolvedValue(mockFamily);

    const result = await service.findById(1);
    expect(result).toEqual(mockFamily);
  });
  it('updates trimmed family fields', async () => {
    repository.findFamilyById.mockResolvedValue({
      ...mockFamily,
      _count: { students: 0 },
    });
    repository.update = jest.fn().mockResolvedValue(mockFamily as any);

    await service.update(1, { familyName: ' الأحمد ', phone: '' });

    expect(repository.update).toHaveBeenCalledWith(1, {
      familyName: 'الأحمد',
      phone: null,
    });
  });

  it('links the guardian login again when the phone changes', async () => {
    repository.findFamilyById
      .mockResolvedValueOnce({ ...mockFamily, _count: { students: 0 } })
      .mockResolvedValueOnce({ ...mockFamily, phone: '0933', _count: { students: 0 } });
    repository.update = jest.fn().mockResolvedValue(mockFamily as any);

    await service.update(1, { phone: '0933' });

    expect(accounts.rePoint).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '0933' }),
      '0912345678',
    );
  });

  it('does not touch the guardian login when the phone is not part of the update', async () => {
    repository.findFamilyById.mockResolvedValue({ ...mockFamily, _count: { students: 0 } });
    repository.update = jest.fn().mockResolvedValue(mockFamily as any);

    await service.update(1, { familyName: 'الأحمد' });

    expect(accounts.rePoint).not.toHaveBeenCalled();
  });

  it('blocks deleting a family that still has students', async () => {
    repository.findFamilyById.mockResolvedValue({
      ...mockFamily,
      _count: { students: 2 },
    });
    repository.delete = jest.fn();

    await expect(service.delete(1)).rejects.toThrow(HttpException);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('soft-deletes an empty family', async () => {
    repository.findFamilyById.mockResolvedValue({
      ...mockFamily,
      _count: { students: 0 },
    });
    repository.delete = jest.fn().mockResolvedValue(mockFamily as any);

    await service.delete(1);

    expect(repository.delete).toHaveBeenCalledWith(1);
  });
});
