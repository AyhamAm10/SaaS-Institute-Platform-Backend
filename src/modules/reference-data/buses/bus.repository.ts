import { Inject, Injectable } from '@nestjs/common';
import { Bus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ContextScopedRepository } from '../../../database/context-scoped.repository';
import { PaginatedResult } from '../../../common/pagination/paginated-result';
import { LookupStore } from '../lookup/lookup.store';
import { LookupQueryDto } from '../lookup/dto/lookup-query.dto';

/**
 * Buses are branch-scoped (X-Branch-Id). Point lookups go through
 * `scopeWhere`, so a bus of another branch is "not found" (role.md §4.3).
 */
@Injectable()
export class BusRepository
  extends ContextScopedRepository<Bus>
  implements LookupStore<Bus>
{
  protected override readonly branchKey = 'branchId';
  protected override readonly softDelete = true;
  protected override readonly softDeleteReleaseFields = ['name'];

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'bus');
  }

  override async findById(id: number): Promise<Bus | null> {
    return this.findOne({ id });
  }

  async findByName(name: string): Promise<Bus | null> {
    return this.findOne({ name });
  }

  /** Name clash inside one branch (names are unique per branch). */
  async findByNameInBranch(
    name: string,
    branchId: number,
  ): Promise<Bus | null> {
    return this.findOne({ name, branchId });
  }

  async findPaginated(query: LookupQueryDto): Promise<PaginatedResult<Bus>> {
    const search = query.search?.trim();
    return this.findManyPaginated(query, {
      where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
    });
  }

  /** Students using the bus. */
  async countUsage(id: number): Promise<number> {
    return this.client.student.count({
      where: { instituteId: this.getInstituteId(), busId: id, deletedAt: null },
    });
  }
}
