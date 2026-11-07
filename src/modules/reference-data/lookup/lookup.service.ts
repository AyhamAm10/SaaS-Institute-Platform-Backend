import { Ensure } from '../../../common/errors/ensure';
import { ErrorMessages } from '../../../common/errors/error-messages';
import { PaginatedResult } from '../../../common/pagination/paginated-result';
import { LookupEntity, LookupStore } from './lookup.store';
import { LookupQueryDto } from './dto/lookup-query.dto';

/**
 * Shared business rules of every reference table (role.md §10 — one owner
 * of the rules instead of six copies):
 * - names are trimmed, required and unique per institute (409);
 * - an entry used by other records cannot be deleted (400, with the count);
 * - other modules validate references through `getById` (404).
 *
 * `resourceKey` is the ErrorMessages key of the entity's display name.
 * Children add their extra fields through `toData` / `validate`.
 */
export abstract class LookupService<
  T extends LookupEntity,
  C extends { name: string },
  U extends { name?: string },
> {
  protected constructor(
    protected readonly store: LookupStore<T>,
    private readonly resourceKey: string,
  ) {}

  findAll(query: LookupQueryDto): Promise<PaginatedResult<T>> {
    return this.store.findPaginated(query);
  }

  async getById(id: number): Promise<T> {
    const entity = await this.store.findById(id);
    Ensure.exists(entity, this.resource());
    return entity!;
  }

  async create(dto: C): Promise<T> {
    const name = await this.assertNameAvailable(dto.name, dto);
    await this.validate(dto);
    return this.store.create({ ...this.toData(dto), name });
  }

  async update(id: number, dto: U): Promise<T> {
    const existing = await this.getById(id);
    const data = this.toData(dto);

    if (dto.name !== undefined) {
      data['name'] = await this.assertNameAvailable(dto.name, dto, existing);
    }
    await this.validate(dto, existing);

    return Object.keys(data).length > 0
      ? this.store.update(id, data)
      : existing;
  }

  async delete(id: number): Promise<void> {
    await this.getById(id);
    const usage = await this.store.countUsage(id);
    Ensure.custom(
      usage > 0,
      ErrorMessages.get('lookup_in_use', {
        resource: this.resource(),
        count: String(usage),
      }),
      400,
    );
    await this.store.delete(id);
  }

  /** Extra fields of the entity (everything except `name`). */
  protected toData(_dto: C | U): Record<string, unknown> {
    return {};
  }

  /** Extra validation (references, branch, ...). */
  protected async validate(_dto: C | U, _existing?: T): Promise<void> {}

  /** Entry that would clash with `name` (override when uniqueness is narrower, e.g. per branch). */
  protected findDuplicate(
    name: string,
    _dto: C | U,
    _existing?: T,
  ): Promise<T | null> {
    return this.store.findByName(name);
  }

  private async assertNameAvailable(
    rawName: string,
    dto: C | U,
    existing?: T,
  ): Promise<string> {
    const name = rawName.trim();
    Ensure.required(name, 'name');
    if (name !== existing?.name) {
      Ensure.custom(
        Boolean(await this.findDuplicate(name, dto, existing)),
        ErrorMessages.get('lookup_name_duplicate', {
          resource: this.resource(),
        }),
        409,
      );
    }
    return name;
  }

  private resource(): string {
    return ErrorMessages.get(this.resourceKey);
  }
}
