import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { FamiliesService } from './families.service';
import { FamilyRepository } from './family.repository';

describe('FamiliesService', () => {
  let service: FamiliesService;
  let repository: any;

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
      ],
    }).compile();

    service = module.get<FamiliesService>(FamiliesService);
    repository = module.get(FamilyRepository);
  });

  it('creates family successfully', async () => {
    repository.create.mockResolvedValue(mockFamily);

    const result = await service.create({
      familyName: 'العمر',
      fatherName: 'محمد',
      motherName: 'فاطمة',
      phone: '0912345678',
    });

    expect(result).toEqual(mockFamily);
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
});
