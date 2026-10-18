import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { StudentFieldsService } from './student-fields.service';
import { StudentFieldRepository } from './student-field.repository';

describe('StudentFieldsService', () => {
  let service: StudentFieldsService;
  let repository: any;

  const mockField = {
    id: 1,
    instituteId: 1,
    name: 'blood_type',
    label: 'فصيلة الدم',
    type: 'SELECT',
    options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
    isRequired: false,
    displayInReport: true,
    sortOrder: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      findAllForTenant: jest.fn(),
      findByName: jest.fn(),
      findFieldById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentFieldsService,
        { provide: StudentFieldRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<StudentFieldsService>(StudentFieldsService);
    repository = module.get(StudentFieldRepository);
  });

  it('lists active fields for tenant', async () => {
    repository.findAllForTenant.mockResolvedValue([mockField]);

    const result = await service.findAll(false);
    expect(result).toEqual([mockField]);
    expect(repository.findAllForTenant).toHaveBeenCalledWith(false);
  });

  it('creates new custom field successfully', async () => {
    repository.findByName.mockResolvedValue(null);
    repository.create.mockResolvedValue(mockField);

    const result = await service.create({
      name: 'blood_type',
      label: 'فصيلة الدم',
      type: 'SELECT',
      options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
      displayInReport: true,
    });

    expect(result).toEqual(mockField);
    expect(repository.create).toHaveBeenCalled();
  });

  it('updates custom field successfully', async () => {
    repository.findFieldById.mockResolvedValue(mockField);
    repository.update.mockResolvedValue({ ...mockField, isRequired: true });

    const result = await service.update(1, { isRequired: true });
    expect(result.isRequired).toBe(true);
    expect(repository.update).toHaveBeenCalledWith(1, { isRequired: true });
  });

  it('deactivates custom field on delete', async () => {
    repository.findFieldById.mockResolvedValue(mockField);
    repository.update.mockResolvedValue({ ...mockField, isActive: false });

    const result = await service.delete(1);
    expect(result.isActive).toBe(false);
    expect(repository.update).toHaveBeenCalledWith(1, { isActive: false });
  });
});
