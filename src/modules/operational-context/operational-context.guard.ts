import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { UserRole } from '../../common/types/user-role.enum';
import { RequestContext } from '../../context/request-context';
import { BranchRepository } from '../branches/branch.repository';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';

/**
 * Operational context guard (global, after the auth guards).
 *
 * The header branch / academic year (`X-Branch-Id`, `X-Academic-Year-Id`)
 * scope every context-scoped read and write (role.md §3). A value that does
 * not belong to the caller's institute is refused with 400 instead of
 * silently returning empty or wrong data (e.g. a stale id stored by the
 * browser for another institute).
 */
@Injectable()
export class OperationalContextGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(
    @Inject(BranchRepository) private readonly branches: BranchRepository,
    @Inject(AcademicYearRepository) private readonly years: AcademicYearRepository,
    reflector?: Reflector,
  ) {
    this.reflector = reflector ?? new Reflector();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ctx = RequestContext.get();
    if (isPublic || !ctx?.instituteId || ctx.role === UserRole.SUPER_ADMIN) return true;

    if (ctx.branchId !== undefined) {
      Ensure.custom(!(await this.branches.findById(ctx.branchId)), ErrorMessages.get('context_branch_invalid'), 400);
    }
    if (ctx.academicYearId !== undefined) {
      Ensure.custom(!(await this.years.findById(ctx.academicYearId)), ErrorMessages.get('context_year_invalid'), 400);
    }
    return true;
  }
}
