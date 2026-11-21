import { Inject, Injectable } from '@nestjs/common';
import { Family } from '@prisma/client';
import { FamilyRepository } from './family.repository';
import {
  FamilyAccountsService,
  FamilyAccountStatus,
} from './family-accounts.service';
import { CreateFamilyDto, parentDetailsData } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { ErrorMessages } from '../../common/errors/error-messages';
import { Ensure } from '../../common/errors/ensure';

@Injectable()
export class FamiliesService {
  constructor(
    @Inject(FamilyRepository)
    private readonly familyRepository: FamilyRepository,
    @Inject(FamilyAccountsService)
    private readonly familyAccounts: FamilyAccountsService,
  ) {}

  /** The family and what happened to its guardian login (see FamilyAccountsService). */
  async create(
    dto: CreateFamilyDto,
  ): Promise<Family & { accountStatus: FamilyAccountStatus }> {
    Ensure.required(dto.familyName?.trim(), 'familyName');

    const family = await this.familyRepository.create({
      familyName: dto.familyName.trim(),
      fatherName: dto.fatherName?.trim() || null,
      motherName: dto.motherName?.trim() || null,
      phone: dto.phone?.trim() || null,
      ...parentDetailsData(dto),
    });
    const accountStatus = await this.familyAccounts.ensureAccount(family);
    return { ...family, accountStatus };
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
    const before = await this.findById(id);

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
    Object.assign(data, parentDetailsData(dto));

    if (Object.keys(data).length > 0) {
      await this.familyRepository.update(id, data);
    }
    const family = await this.findById(id);
    // A new phone (or a first one) gives the family its guardian login
    if (dto.phone !== undefined || before.phone !== family.phone) {
      await this.familyAccounts.rePoint(family, before.phone);
    }
    return family;
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
