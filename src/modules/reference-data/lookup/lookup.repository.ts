import { TenantAwareRepository } from '../../../database/tenant-aware.repository';
import { PaginatedResult } from '../../../common/pagination/paginated-result';
import { LookupEntity, LookupStore } from './lookup.store';
import { LookupQueryDto } from './dto/lookup-query.dto';

/**
 * Base repository of institute-wide reference tables.
 * Soft delete with the `name` released, so a deleted name can be reused.
 * Children only declare the model name and how usage is counted.
 */
export abstract class LookupRepository<T extends LookupEntity>
  extends TenantAwareRepository<T>
  implements LookupStore<T>
{
  protected override readonly softDelete = true;
  protected override readonly softDeleteReleaseFields = ['name'];

  async findByName(name: string): Promise<T | null> {
    return this.findOne({ name });
  }

  async findPaginated(query: LookupQueryDto): Promise<PaginatedResult<T>> {
    return this.findManyPaginated(query, {
      where: this.searchWhere(query),
      orderBy: { name: 'asc' },
    });
  }

  /** Name search plus child-specific filters. */
  protected searchWhere(query: LookupQueryDto): Record<string, unknown> {
    const search = query.search?.trim();
    return search ? { name: { contains: search, mode: 'insensitive' } } : {};
  }

  abstract countUsage(id: number): Promise<number>;
}
