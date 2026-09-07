import { Inject, Injectable } from '@nestjs/common';
import { AcademicBranch } from '@prisma/client';
import { AcademicBranchRepository } from './academic-branch.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { CreateAcademicBranchDto } from './dto/create-academic-branch.dto';
import { UpdateAcademicBranchDto } from './dto/update-academic-branch.dto';
import { AcademicBranchQueryDto } from './dto/academic-branch-query.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

/**
 * Standard Arabic default branches configured automatically for each Institute.
 */
export const DEFAULT_ACADEMIC_BRANCHES = [
  {
    name: 'الصف التاسع',
    code: 'G9',
    description: 'المرحلة الإعدادية — الصف التاسع الأساسي',
  },
  {
    name: 'الثانوي العام — الفرع العلمي',
    code: 'SEC_SCI',
    description: 'المرحلة الثانوية — الفرع العلمي',
  },
  {
    name: 'الثانوي العام — الفرع الأدبي',
    code: 'SEC_LIT',
    description: 'المرحلة الثانوية — الفرع الأدبي',
  },
];

@Injectable()
export class AcademicBranchesService {
  constructor(
    @Inject(AcademicBranchRepository)
    private readonly branchRepository: AcademicBranchRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  /**
   * Provision standard Arabic default branches for a specific institute.
   * Safe against duplicate creation (idempotent).
   */
  async provisionDefaultBranches(instituteId: number): Promise<AcademicBranch[]> {
    return this.transactionHelper.executeInTransaction(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = (this.branchRepository as any).client;
      const branches: AcademicBranch[] = [];

      for (const def of DEFAULT_ACADEMIC_BRANCHES) {
        const existing = await client.academicBranch.findFirst({
          where: {
            instituteId,
            name: def.name,
          },
        });

        if (!existing) {
          const created = await client.academicBranch.create({
            data: {
              instituteId,
              name: def.name,
              code: def.code,
              description: def.description,
            },
          });
          branches.push(created);
        } else {
          branches.push(existing);
        }
      }

      return branches;
    });
  }

  /**
   * Create an Academic Branch for the current institute.
   */
  async create(dto: CreateAcademicBranchDto): Promise<AcademicBranch> {
    const trimmedName = dto.name.trim();
    Ensure.required(trimmedName, 'name');

    const existing = await this.branchRepository.findByName(trimmedName);
    Ensure.custom(
      Boolean(existing),
      ErrorMessages.get('academic_branch_name_duplicate'),
      409,
    );

    return this.branchRepository.create({
      name: trimmedName,
      code: dto.code?.trim() || null,
      description: dto.description?.trim() || null,
    });
  }

  /**
   * Update an Academic Branch for the current institute.
   */
  async update(id: number, dto: UpdateAcademicBranchDto): Promise<AcademicBranch> {
    const existing = await this.branchRepository.findById(id);
    Ensure.exists(existing, 'Academic branch');

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      Ensure.required(trimmedName, 'name');

      if (trimmedName !== existing.name) {
        const duplicate = await this.branchRepository.findByName(trimmedName);
        Ensure.custom(
          Boolean(duplicate && duplicate.id !== id),
          ErrorMessages.get('academic_branch_name_duplicate'),
          409,
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData['name'] = dto.name.trim();
    if (dto.code !== undefined) updateData['code'] = dto.code ? dto.code.trim() : null;
    if (dto.description !== undefined) updateData['description'] = dto.description ? dto.description.trim() : null;

    return this.branchRepository.update(id, updateData);
  }

  /**
   * Delete an Academic Branch if not referenced by any section.
   */
  async delete(id: number): Promise<void> {
    const existing = await this.branchRepository.findById(id);
    Ensure.exists(existing, 'Academic branch');

    const linkedSectionsCount = await this.branchRepository.countSections(id);
    Ensure.custom(
      linkedSectionsCount > 0,
      ErrorMessages.get('academic_branch_has_sections'),
      400,
    );

    await this.branchRepository.delete(id);
  }

  /**
   * Find all Academic Branches for the current institute (paginated with optional search).
   */
  async findAll(query: AcademicBranchQueryDto): Promise<PaginatedResult<AcademicBranch>> {
    return this.branchRepository.findAllPaginated(query, query.search);
  }

  /**
   * Retrieve a single Academic Branch by ID.
   */
  async findById(id: number): Promise<AcademicBranch> {
    const branch = await this.branchRepository.findById(id);
    Ensure.exists(branch, 'Academic branch');
    return branch;
  }
}
