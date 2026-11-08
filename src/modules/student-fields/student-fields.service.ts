import { Inject, Injectable } from '@nestjs/common';
import { StudentField } from '@prisma/client';
import { StudentFieldRepository } from './student-field.repository';
import { CreateStudentFieldDto } from './dto/create-student-field.dto';
import type { FieldType } from './dto/create-student-field.dto';
import { UpdateStudentFieldDto } from './dto/update-student-field.dto';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';

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

    if (dto.isFilterable) {
      Ensure.custom(
        dto.type !== 'SELECT' && dto.type !== 'BOOLEAN',
        ErrorMessages.get('custom_field_filterable_type'),
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
      isFilterable: dto.isFilterable ?? false,
      sortOrder: dto.sortOrder ?? 0,
      isActive: true,
    });
  }

  async update(id: number, dto: UpdateStudentFieldDto): Promise<StudentField> {
    const field = await this.fieldRepository.findFieldById(id);
    Ensure.exists(field, 'StudentField');

    const targetType = (dto.type ?? field.type) as FieldType;
    const targetFilterable = dto.isFilterable ?? field.isFilterable;

    if (targetFilterable) {
      Ensure.custom(
        targetType !== 'SELECT' && targetType !== 'BOOLEAN',
        ErrorMessages.get('custom_field_filterable_type'),
        400,
      );
    }

    if (dto.type !== undefined && dto.type !== field.type) {
      const count = await this.fieldRepository.countStudentsUsingField(
        field.name,
      );
      Ensure.custom(
        count > 0,
        ErrorMessages.get('custom_field_type_in_use', { field: field.label }),
        400,
      );
    }

    if (dto.options !== undefined && field.type === 'SELECT') {
      const existingOptions = Array.isArray(field.options)
        ? (field.options as string[])
        : [];
      const newOptions = dto.options || [];
      const removedOptions = existingOptions.filter(
        (opt) => !newOptions.includes(opt),
      );
      for (const opt of removedOptions) {
        const count = await this.fieldRepository.countStudentsUsingOption(
          field.name,
          opt,
        );
        Ensure.custom(
          count > 0,
          ErrorMessages.get('custom_field_option_in_use', { option: opt }),
          400,
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data['label'] = dto.label.trim();
    if (dto.type !== undefined) data['type'] = dto.type;
    if (dto.options !== undefined) data['options'] = dto.options;
    if (dto.isRequired !== undefined) data['isRequired'] = dto.isRequired;
    if (dto.displayInReport !== undefined)
      data['displayInReport'] = dto.displayInReport;
    if (dto.isFilterable !== undefined)
      data['isFilterable'] = dto.isFilterable;
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
