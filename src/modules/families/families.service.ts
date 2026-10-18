import { Inject, Injectable } from '@nestjs/common';
import { Family } from '@prisma/client';
import { FamilyRepository } from './family.repository';
import { CreateFamilyDto } from './dto/create-family.dto';
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
}
