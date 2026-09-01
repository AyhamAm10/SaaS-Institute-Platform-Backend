import { NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TransactionContext } from './transaction.context';
import { PaginationQueryDto } from '../common/pagination/pagination.dto';
import { createPaginatedResult, PaginatedResult } from '../common/pagination/paginated-result';

/**
 * Type for any Prisma model delegate with standard CRUD operations.
 * Used internally by the base repository to access the delegate dynamically.
 */
interface PrismaDelegate {
  findUnique(args: Record<string, unknown>): Promise<unknown>;
  findFirst(args: Record<string, unknown>): Promise<unknown>;
  findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  create(args: Record<string, unknown>): Promise<unknown>;
  update(args: Record<string, unknown>): Promise<unknown>;
  delete(args: Record<string, unknown>): Promise<unknown>;
  count(args?: Record<string, unknown>): Promise<number>;
}

/**
 * Abstract base repository providing common CRUD operations via Prisma.
 *
 * This is intentionally slim — it provides the 80% of operations that are the
 * same across all models. Domain-specific repositories extend this and add
 * properly typed, specialized queries using `this.prisma.<model>.<method>(...)`.
 *
 * The `client` property checks TransactionContext so all operations automatically
 * use the transaction client when inside a Prisma interactive transaction.
 *
 * @template T - The Prisma model type (e.g., User, Institute)
 */
export abstract class BaseRepository<T> {
  constructor(
    protected readonly prisma: PrismaService,
    /** The camelCase model accessor name (e.g., 'user', 'academicYear') */
    protected readonly modelName: string,
  ) {}

  /**
   * Returns the active transaction client or the regular PrismaService.
   * This makes transactions transparent to all repository methods.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected get client(): Record<string, any> {
    return TransactionContext.get() ?? this.prisma;
  }

  /** Access the Prisma model delegate (e.g., prisma.user, prisma.institute). */
  protected get delegate(): PrismaDelegate {
    return this.client[this.modelName] as PrismaDelegate;
  }

  async findById(id: number): Promise<T | null> {
    return this.delegate.findUnique({ where: { id } }) as Promise<T | null>;
  }

  async findOne(where: Record<string, unknown>): Promise<T | null> {
    return this.delegate.findFirst({ where }) as Promise<T | null>;
  }

  async findMany(options?: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown> | Record<string, unknown>[];
    skip?: number;
    take?: number;
    include?: Record<string, unknown>;
  }): Promise<T[]> {
    return this.delegate.findMany(options) as Promise<T[]>;
  }

  async create(data: Record<string, unknown>): Promise<T> {
    return this.delegate.create({ data }) as Promise<T>;
  }

  async update(id: number, data: Record<string, unknown>): Promise<T> {
    return this.delegate.update({ where: { id }, data }) as Promise<T>;
  }

  async delete(id: number): Promise<T> {
    return this.delegate.delete({ where: { id } }) as Promise<T>;
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.delegate.count(where ? { where } : undefined);
  }

  async exists(where: Record<string, unknown>): Promise<boolean> {
    const total = await this.count(where);
    return total > 0;
  }

  /**
   * Paginated query with total count.
   * Returns a consistent PaginatedResult shape.
   */
  async findManyPaginated(
    pagination: PaginationQueryDto,
    options?: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, unknown> | Record<string, unknown>[];
      include?: Record<string, unknown>;
    },
  ): Promise<PaginatedResult<T>> {
    const [data, total] = await Promise.all([
      this.findMany({
        ...options,
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.count(options?.where),
    ]);

    return createPaginatedResult(data, total, pagination.page, pagination.limit);
  }
}
