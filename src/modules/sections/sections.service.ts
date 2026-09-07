import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Section } from '@prisma/client';
import { SectionRepository } from './section.repository';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
import { BranchRepository } from '../branches/branch.repository';
import { AcademicBranchRepository } from '../academic-branches/academic-branch.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { UpdateSectionFeeDto } from './dto/update-section-fee.dto';
import { SectionQueryDto } from './dto/section-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

/**
 * Service managing Section business logic, cross-entity validation,
 * and tenant isolation rules.
 */
@Injectable()
export class SectionsService {
  constructor(
    @Inject(SectionRepository)
    private readonly sectionRepository: SectionRepository,
    @Inject(AcademicYearRepository)
    private readonly academicYearRepository: AcademicYearRepository,
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
    @Inject(AcademicBranchRepository)
    private readonly academicBranchRepository: AcademicBranchRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  /**
   * Create a new section.
   *
   * Validates:
   * - Fee is non-negative
   * - Branch exists and belongs to the authenticated tenant
   * - Academic year exists and belongs to the authenticated tenant
   * - Academic branch exists and belongs to the authenticated tenant
   * - No duplicate section with the same name in the same branch & academic year
   */
  async create(dto: CreateSectionDto): Promise<Section> {
    // 1. Validate non-negative fee
    Ensure.custom(
      dto.feeAmount < 0,
      ErrorMessages.get('invalid_fee'),
      400,
    );

    // 2. Validate Branch tenant ownership
    const branch = await this.branchRepository.findById(dto.branchId);
    if (!branch) {
      const rawBranch = await this.branchRepository.findRawById(dto.branchId);
      Ensure.custom(
        rawBranch !== null,
        ErrorMessages.get('branch_mismatch'),
        400,
      );
      Ensure.exists(null, 'Branch');
    }

    // 3. Validate Academic Year tenant ownership
    const academicYear = await this.academicYearRepository.findById(dto.academicYearId);
    if (!academicYear) {
      const rawYear = await this.academicYearRepository.findRawById(dto.academicYearId);
      Ensure.custom(
        rawYear !== null,
        ErrorMessages.get('academic_year_mismatch'),
        400,
      );
      Ensure.exists(null, 'Academic year');
    }

    // 4. Validate Academic Branch tenant ownership
    const academicBranch = await this.academicBranchRepository.findById(dto.academicBranchId);
    if (!academicBranch) {
      const rawBranch = await this.academicBranchRepository.findRawById(dto.academicBranchId);
      Ensure.custom(
        rawBranch !== null,
        ErrorMessages.get('academic_branch_mismatch'),
        400,
      );
      Ensure.exists(null, 'Academic branch');
    }

    // 5. Validate unique name per (branchId, academicYearId) within the tenant
    const existing = await this.sectionRepository.findByNameAndBranch(
      dto.branchId,
      dto.academicYearId,
      dto.name,
    );
    Ensure.custom(
      Boolean(existing),
      ErrorMessages.get('section_name_duplicate'),
      409,
    );

    // 6. Persist section
    return this.sectionRepository.create({
      name: dto.name,
      grade: dto.grade ?? academicBranch!.name,
      branchId: dto.branchId,
      academicYearId: dto.academicYearId,
      academicBranchId: dto.academicBranchId,
      feeAmount: new Prisma.Decimal(dto.feeAmount),
    });
  }

  /**
   * Update an existing section.
   */
  async update(id: number, dto: UpdateSectionDto): Promise<Section> {
    // 1. Verify existence and tenant ownership
    const existing = await this.sectionRepository.findById(id);
    Ensure.exists(existing, 'Section');

    // 2. Validate fee if provided
    if (dto.feeAmount !== undefined) {
      Ensure.custom(
        dto.feeAmount < 0,
        ErrorMessages.get('invalid_fee'),
        400,
      );
    }

    // 3. Validate Branch if changed
    const targetBranchId = dto.branchId ?? existing.branchId;
    if (dto.branchId !== undefined && dto.branchId !== existing.branchId) {
      const branch = await this.branchRepository.findById(dto.branchId);
      if (!branch) {
        const rawBranch = await this.branchRepository.findRawById(dto.branchId);
        Ensure.custom(
          rawBranch !== null,
          ErrorMessages.get('branch_mismatch'),
          400,
        );
        Ensure.exists(null, 'Branch');
      }
    }

    // 4. Validate Academic Year if changed
    const targetAcademicYearId = dto.academicYearId ?? existing.academicYearId;
    if (dto.academicYearId !== undefined && dto.academicYearId !== existing.academicYearId) {
      const academicYear = await this.academicYearRepository.findById(dto.academicYearId);
      if (!academicYear) {
        const rawYear = await this.academicYearRepository.findRawById(dto.academicYearId);
        Ensure.custom(
          rawYear !== null,
          ErrorMessages.get('academic_year_mismatch'),
          400,
        );
        Ensure.exists(null, 'Academic year');
      }
    }

    // 5. Validate Academic Branch if changed
    if (dto.academicBranchId !== undefined && dto.academicBranchId !== existing.academicBranchId) {
      const academicBranch = await this.academicBranchRepository.findById(dto.academicBranchId);
      if (!academicBranch) {
        const rawBranch = await this.academicBranchRepository.findRawById(dto.academicBranchId);
        Ensure.custom(
          rawBranch !== null,
          ErrorMessages.get('academic_branch_mismatch'),
          400,
        );
        Ensure.exists(null, 'Academic branch');
      }
    }

    // 6. Validate unique name per (branchId, academicYearId) if name or relations changed
    const targetName = dto.name ?? existing.name;
    if (dto.name !== undefined || dto.branchId !== undefined || dto.academicYearId !== undefined) {
      const duplicate = await this.sectionRepository.findByNameAndBranch(
        targetBranchId,
        targetAcademicYearId,
        targetName,
      );
      Ensure.custom(
        Boolean(duplicate && duplicate.id !== id),
        ErrorMessages.get('section_name_duplicate'),
        409,
      );
    }

    // 7. Build update payload (prevent mass assignment of protected fields)
    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData['name'] = dto.name;
    if (dto.grade !== undefined) updateData['grade'] = dto.grade;
    if (dto.branchId !== undefined) updateData['branchId'] = dto.branchId;
    if (dto.academicYearId !== undefined) updateData['academicYearId'] = dto.academicYearId;
    if (dto.academicBranchId !== undefined) updateData['academicBranchId'] = dto.academicBranchId;
    if (dto.feeAmount !== undefined) {
      updateData['feeAmount'] = new Prisma.Decimal(dto.feeAmount);
    }

    return this.sectionRepository.update(id, updateData);
  }

  /**
   * Dedicated method to update the section fee amount.
   */
  async updateFee(id: number, dto: UpdateSectionFeeDto): Promise<Section> {
    Ensure.custom(
      dto.feeAmount < 0,
      ErrorMessages.get('invalid_fee'),
      400,
    );

    const existing = await this.sectionRepository.findById(id);
    Ensure.exists(existing, 'Section');

    return this.sectionRepository.update(id, {
      feeAmount: new Prisma.Decimal(dto.feeAmount),
    });
  }

  /**
   * Retrieve complete section details for the admin dashboard.
   */
  async getDetails(id: number): Promise<Record<string, unknown>> {
    const details = await this.sectionRepository.findByIdWithDetails(id);
    Ensure.exists(details, 'Section');
    return details;
  }

  /**
   * Paginated list of sections with filters.
   */
  async findAll(query: SectionQueryDto): Promise<PaginatedResult<Section>> {
    return this.sectionRepository.findAllFiltered(query);
  }

  /**
   * Retrieve a section by ID.
   */
  async findById(id: number): Promise<Section> {
    const section = await this.sectionRepository.findById(id);
    Ensure.exists(section, 'Section');
    return section;
  }

  /**
   * Cross-entity relationship validation between Section and Academic Year.
   *
   * Verifies:
   * 1. Academic Year exists and belongs to current tenant.
   * 2. Section exists and belongs to current tenant.
   * 3. Section actually belongs to the given Academic Year.
   */
  async validateSectionBelongsToAcademicYear(
    sectionId: number,
    academicYearId: number,
  ): Promise<{ valid: boolean; section: Section }> {
    // Check academic year in tenant
    const year = await this.academicYearRepository.findById(academicYearId);
    if (!year) {
      const rawYear = await this.academicYearRepository.findRawById(academicYearId);
      Ensure.custom(
        rawYear !== null,
        ErrorMessages.get('academic_year_mismatch'),
        400,
      );
      Ensure.exists(null, 'Academic year');
    }

    // Check section in tenant
    const section = await this.sectionRepository.findById(sectionId);
    Ensure.exists(section, 'Section');

    // Check relation
    Ensure.custom(
      section.academicYearId !== academicYearId,
      ErrorMessages.get('section_academic_year_mismatch'),
      400,
    );

    return { valid: true, section };
  }
}
