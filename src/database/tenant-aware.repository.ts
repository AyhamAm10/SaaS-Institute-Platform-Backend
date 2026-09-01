import { NotFoundException } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import { RequestContext } from '../context/request-context';
import { PrismaService } from './prisma.service';

/**
 * Tenant-aware repository that automatically scopes all operations
 * to the current institute (resolved from AsyncLocalStorage).
 *
 * This is the CORE of multi-tenant isolation:
 * - findById() verifies the record belongs to the current institute
 * - findMany() automatically adds instituteId to the where clause
 * - create() automatically sets instituteId on the new record
 * - update/delete() verify ownership before modification
 *
 * Services NEVER need to manually add instituteId to queries.
 *
 * Usage: Extend this for any model that has an `instituteId` field.
 *   class UserRepository extends TenantAwareRepository<User> { ... }
 *
 * For models that need cross-tenant access, use SystemRepository instead.
 */
export abstract class TenantAwareRepository<T> extends BaseRepository<T> {
  constructor(prisma: PrismaService, modelName: string) {
    super(prisma, modelName);
  }

  /** Get the current institute ID from the request context. */
  protected getInstituteId(): number {
    return RequestContext.getInstituteId();
  }

  /** Inject instituteId into any where clause. */
  protected scopeWhere(where?: Record<string, unknown>): Record<string, unknown> {
    return { ...where, instituteId: this.getInstituteId() };
  }

  // ── Overridden CRUD methods with automatic tenant scoping ──────────────

  override async findById(id: number): Promise<T | null> {
    // Use findFirst with compound condition since (id, instituteId) may not
    // be a declared @@unique on every model.
    return this.delegate.findFirst({
      where: { id, instituteId: this.getInstituteId() },
    }) as Promise<T | null>;
  }

  override async findOne(where: Record<string, unknown>): Promise<T | null> {
    return this.delegate.findFirst({
      where: this.scopeWhere(where),
    }) as Promise<T | null>;
  }

  override async findMany(options?: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown> | Record<string, unknown>[];
    skip?: number;
    take?: number;
    include?: Record<string, unknown>;
  }): Promise<T[]> {
    return this.delegate.findMany({
      ...options,
      where: this.scopeWhere(options?.where),
    }) as Promise<T[]>;
  }

  override async create(data: Record<string, unknown>): Promise<T> {
    return this.delegate.create({
      data: { ...data, instituteId: this.getInstituteId() },
    }) as Promise<T>;
  }

  override async update(id: number, data: Record<string, unknown>): Promise<T> {
    // Verify the record belongs to this tenant before updating
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(
        `${this.modelName} with id ${id} not found in current tenant`,
      );
    }
    return this.delegate.update({ where: { id }, data }) as Promise<T>;
  }

  override async delete(id: number): Promise<T> {
    // Verify the record belongs to this tenant before deleting
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(
        `${this.modelName} with id ${id} not found in current tenant`,
      );
    }
    return this.delegate.delete({ where: { id } }) as Promise<T>;
  }

  override async count(where?: Record<string, unknown>): Promise<number> {
    return this.delegate.count({ where: this.scopeWhere(where) });
  }

  override async exists(where: Record<string, unknown>): Promise<boolean> {
    const total = await this.count(where);
    return total > 0;
  }
}
