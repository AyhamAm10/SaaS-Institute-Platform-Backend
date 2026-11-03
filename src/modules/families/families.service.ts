import { Inject, Injectable } from '@nestjs/common';
import { Family } from '@prisma/client';
import { FamilyRepository } from './family.repository';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { ErrorMessages } from '../../common/errors/error-messages';
import { Ensure } from '../../common/errors/ensure';

@Injectable()
export class FamiliesService {
  constructor(
    @Inject(FamilyRepository)
    private readonly familyRepository: FamilyRepository,
  ) {}

  async create(dto: CreateFamilyDto): Promise<Family> {
    Ensure.required(dto.familyName?.trim(), 'familyName');

    return this.familyRepository.create({
      familyName: dto.familyName.trim(),
      fatherName: dto.fatherName?.trim() || null,
      motherName: dto.motherName?.trim() || null,
      phone: dto.phone?.trim() || null,
    });
  }

  async search(query?: string): Promise<Family[]> {
    return this.familyRepository.search(query);
  }

  async findById(id: number): Promise<Family> {
    const family = await this.familyRepository.findFamilyById(id);
    Ensure.exists(family, 'Family');
    return family;
  }

  async update(id: number, dto: UpdateFamilyDto): Promise<Family> {
    await this.findById(id);

    const data: Record<string, unknown> = {};
    if (dto.familyName !== undefined) {
      Ensure.required(dto.familyName.trim(), 'familyName');
      data['familyName'] = dto.familyName.trim();
    }
    if (dto.fatherName !== undefined)
      data['fatherName'] = dto.fatherName.trim() || null;
    if (dto.motherName !== undefined)
      data['motherName'] = dto.motherName.trim() || null;
    if (dto.phone !== undefined) data['phone'] = dto.phone.trim() || null;

    if (Object.keys(data).length > 0) {
      await this.familyRepository.update(id, data);
    }
    return this.findById(id);
  }

  /** Soft-delete a family. Blocked while it still has (non-deleted) students. */
  async delete(id: number): Promise<void> {
    const family = await this.findById(id);
    Ensure.custom(
      (family as Family & { _count?: { students: number } })._count!.students >
        0,
      ErrorMessages.get('family_has_students'),
      400,
    );
    await this.familyRepository.delete(id);
  }
}
