import { PaginatedResult } from '../../../common/pagination/paginated-result';
import { LookupQueryDto } from './dto/lookup-query.dto';

/** Minimal shape every reference-data entity shares. */
export interface LookupEntity {
  id: number;
  name: string;
}

/**
 * Persistence contract used by LookupService. Implemented by LookupRepository
 * (institute-wide tables) and by branch-scoped repositories such as BusRepository.
 */
export interface LookupStore<T extends LookupEntity> {
  findById(id: number): Promise<T | null>;
  findByName(name: string): Promise<T | null>;
  findPaginated(query: LookupQueryDto): Promise<PaginatedResult<T>>;
  create(data: Record<string, unknown>): Promise<T>;
  update(id: number, data: Record<string, unknown>): Promise<T>;
  delete(id: number): Promise<T>;
  /** Records referencing this entry (deletion is refused while > 0). */
  countUsage(id: number): Promise<number>;
}
