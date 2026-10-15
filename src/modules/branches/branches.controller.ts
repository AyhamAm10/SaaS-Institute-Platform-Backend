import { Controller, Get, Inject } from '@nestjs/common';
import { Branch } from '@prisma/client';
import { BranchRepository } from './branch.repository';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

/**
 * Controller for physical institute Branches.
 * All operations are tenant-scoped via BranchRepository.
 */
@Controller('branches')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class BranchesController {
  constructor(
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
  ) {}

  /**
   * Get all active branches for the authenticated tenant.
   * Ensures at least the default branch exists if none has been provisioned yet.
   */
  @Get()
  async findAll(): Promise<Branch[]> {
    let branches = await this.branchRepository.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });

    if (branches.length === 0) {
      const defaultBranch = await this.branchRepository.getOrCreateDefaultBranch();
      branches = [defaultBranch];
    }

    return branches;
  }
}
