import { Inject, Injectable } from '@nestjs/common';
import { Branch } from '@prisma/client';
import { BranchRepository } from './branch.repository';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
  ) {}

  async findAll(): Promise<Branch[]> {
    let branches = await this.branchRepository.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });

    if (branches.length === 0) {
      const defaultBranch =
        await this.branchRepository.getOrCreateDefaultBranch();
      branches = [defaultBranch];
    }

    return branches;
  }

  async findById(id: number): Promise<Branch> {
    const branch = await this.branchRepository.findById(id);
    Ensure.exists(branch, 'Branch');
    return branch;
  }

  async create(dto: CreateBranchDto): Promise<Branch> {
    const name = dto.name.trim();
    const code = dto.code.trim();

    const existingByName = await this.branchRepository.findOne({ name });
    Ensure.custom(
      existingByName !== null,
      ErrorMessages.get('branch_name_duplicate'),
      409,
    );

    const existingByCode = await this.branchRepository.findOne({ code });
    Ensure.custom(
      existingByCode !== null,
      ErrorMessages.get('branch_code_duplicate'),
      409,
    );

    return this.branchRepository.create({
      name,
      code,
      phone: dto.phone?.trim() ?? '',
      address: dto.address?.trim() ?? '',
      isActive: true,
    });
  }

  async update(id: number, dto: UpdateBranchDto): Promise<Branch> {
    const existing = await this.branchRepository.findById(id);
    Ensure.exists(existing, 'Branch');

    if (dto.name && dto.name.trim() !== existing.name) {
      const existingByName = await this.branchRepository.findOne({
        name: dto.name.trim(),
      });
      Ensure.custom(
        existingByName !== null,
        ErrorMessages.get('branch_name_duplicate'),
        409,
      );
    }

    if (dto.code && dto.code.trim() !== existing.code) {
      const existingByCode = await this.branchRepository.findOne({
        code: dto.code.trim(),
      });
      Ensure.custom(
        existingByCode !== null,
        ErrorMessages.get('branch_code_duplicate'),
        409,
      );
    }

    return this.branchRepository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
      ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
    });
  }

  async delete(id: number): Promise<void> {
    const existing = await this.branchRepository.findById(id);
    Ensure.exists(existing, 'Branch');

    await this.branchRepository.update(id, { isActive: false });
  }
}
