import { Inject, Injectable } from '@nestjs/common';
import { StudentField } from '@prisma/client';
import { StudentFieldRepository } from './student-field.repository';
import { CreateStudentFieldDto } from './dto/create-student-field.dto';
import { UpdateStudentFieldDto } from './dto/update-student-field.dto';
import { Ensure } from '../../common/errors/ensure';

@Injectable()
export class StudentFieldsService {
  constructor(
    @Inject(StudentFieldRepository)
    private readonly fieldRepository: StudentFieldRepository,
  ) {}

  async findAll(includeInactive = false): Promise<StudentField[]> {
    return this.fieldRepository.findAllForTenant(includeInactive);
  }

  async create(dto: CreateStudentFieldDto): Promise<StudentField> {
    const name =
      dto.name?.trim() ||
      `field_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    Ensure.required(dto.label?.trim(), 'label');

    const existing = await this.fieldRepository.findByName(name);
    Ensure.alreadyExists(existing, 'StudentField');

    if (dto.type === 'SELECT') {
      Ensure.custom(
        !Array.isArray(dto.options) || dto.options.length === 0,
        'Select type field must have at least one option',
        400,
      );
    }

    return this.fieldRepository.create({
      name,
      label: dto.label.trim(),
      type: dto.type,
      options: dto.options || [],
      isRequired: dto.isRequired ?? false,
      displayInReport: dto.displayInReport ?? false,
      sortOrder: dto.sortOrder ?? 0,
      isActive: true,
    });
  }

  async update(id: number, dto: UpdateStudentFieldDto): Promise<StudentField> {
    const field = await this.fieldRepository.findFieldById(id);
    Ensure.exists(field, 'StudentField');

    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data['label'] = dto.label.trim();
    if (dto.options !== undefined) data['options'] = dto.options;
    if (dto.isRequired !== undefined) data['isRequired'] = dto.isRequired;
    if (dto.displayInReport !== undefined) data['displayInReport'] = dto.displayInReport;
    if (dto.sortOrder !== undefined) data['sortOrder'] = dto.sortOrder;
    if (dto.isActive !== undefined) data['isActive'] = dto.isActive;

    return this.fieldRepository.update(id, data);
  }

  async delete(id: number): Promise<StudentField> {
    const field = await this.fieldRepository.findFieldById(id);
    Ensure.exists(field, 'StudentField');

    return this.fieldRepository.update(id, { isActive: false });
  }
}
