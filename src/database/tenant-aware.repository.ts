import { NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { RequestContext } from '../context/request-context';
import { PrismaService } from './prisma.service';
import { TransactionHelper } from './transaction.helper';

/** Keys never written to the audit log (role.md §8.2 — password secrecy). */
const AUDIT_REDACTED_KEYS = /password/i;

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
 * Optional per-model behaviour, configured by the child repository
 * (same declaration style as `branchKey` / `yearKey`):
 * - `softDelete = true`  → model has `deletedAt`: delete() marks the row as
 *   deleted and every scoped read skips deleted rows.
 * - `softDeleteReleaseFields` → unique columns suffixed on soft delete so the
 *   value (e.g. a name) can be reused by a new record.
 * - `audited = true`     → model has `createdById` / `updatedById`: actor is
 *   stamped on create/update and every update/delete writes an `AuditLog`
 *   row in the same transaction.
 *
 * Usage: Extend this for any model that has an `instituteId` field.
 *   class UserRepository extends TenantAwareRepository<User> { ... }
 *
 * For models that need cross-tenant access, use SystemRepository instead.
 */
export abstract class TenantAwareRepository<T> extends BaseRepository<T> {
  protected readonly softDelete: boolean = false;
  protected readonly softDeleteReleaseFields: readonly string[] = [];
  protected readonly audited: boolean = false;

  constructor(prisma: PrismaService, modelName: string) {
    super(prisma, modelName);
  }

  /** Get the current institute ID from the request context. */
  getInstituteId(): number {
    return RequestContext.getInstituteId();
  }

  /** Inject instituteId into any where clause. */
  protected scopeWhere(
    where?: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.notDeleted({ ...where, instituteId: this.getInstituteId() });
  }

  /**
   * Excludes soft-deleted rows for soft-delete models, unless the caller
   * filters on `deletedAt` explicitly. Use it in custom queries that do not
   * go through `scopeWhere()` (e.g. raw-by-id cross-tenant checks).
   */
  protected notDeleted(
    where?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!this.softDelete || (where && 'deletedAt' in where)) {
      return { ...where };
    }
    return { ...where, deletedAt: null };
  }

  // ── Overridden CRUD methods with automatic tenant scoping ──────────────

  override async findById(id: number): Promise<T | null> {
    // Use findFirst with compound condition since (id, instituteId) may not
    // be a declared @@unique on every model.
    return this.delegate.findFirst({
      where: this.notDeleted({ id, instituteId: this.getInstituteId() }),
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
    const actorId = this.getActorId();
    return this.delegate.create({
      data: {
        ...data,
        ...(this.audited && { createdById: actorId, updatedById: actorId }),
        instituteId: this.getInstituteId(),
      },
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
    if (!this.audited) {
      return this.delegate.update({ where: { id }, data }) as Promise<T>;
    }

    return TransactionHelper.run(this.prisma, async () => {
      const updated = (await this.delegate.update({
        where: { id },
        data: { ...data, updatedById: this.getActorId() },
      })) as T;
      await this.writeAudit(AuditAction.UPDATE, id, existing, data);
      return updated;
    });
  }

  override async delete(id: number): Promise<T> {
    // Verify the record belongs to this tenant before deleting
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(
        `${this.modelName} with id ${id} not found in current tenant`,
      );
    }
    if (!this.softDelete && !this.audited) {
      return this.delegate.delete({ where: { id } }) as Promise<T>;
    }

    return TransactionHelper.run(this.prisma, async () => {
      const removed = this.softDelete
        ? ((await this.delegate.update({
            where: { id },
            data: this.buildSoftDeleteData(id, existing),
          })) as T)
        : ((await this.delegate.delete({ where: { id } })) as T);
      if (this.audited) {
        await this.writeAudit(AuditAction.DELETE, id, existing, null);
      }
      return removed;
    });
  }

  override async count(where?: Record<string, unknown>): Promise<number> {
    return this.delegate.count({ where: this.scopeWhere(where) });
  }

  override async exists(where: Record<string, unknown>): Promise<boolean> {
    const total = await this.count(where);
    return total > 0;
  }

  // ── Soft delete & audit internals ──────────────────────────────────────

  /** Authenticated user performing the change, or null outside a user request. */
  protected getActorId(): number | null {
    return RequestContext.get()?.userId || null;
  }

  private buildSoftDeleteData(
    id: number,
    existing: T,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = { deletedAt: new Date() };
    const row = existing as Record<string, unknown>;
    for (const field of this.softDeleteReleaseFields) {
      if (typeof row[field] === 'string') {
        data[field] = `${row[field]}__deleted_${id}`;
      }
    }
    if (this.audited) {
      data['updatedById'] = this.getActorId();
    }
    return data;
  }

  private async writeAudit(
    action: AuditAction,
    entityId: number,
    before: T,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    await this.client['auditLog'].create({
      data: {
        instituteId: this.getInstituteId(),
        userId: this.getActorId(),
        entity: this.modelName,
        entityId,
        action,
        before: this.toAuditJson(before as Record<string, unknown>),
        changes: changes ? this.toAuditJson(changes) : undefined,
      },
    });
  }

  /** JSON-safe snapshot (Decimal/Date → string) without secret fields. */
  private toAuditJson(value: Record<string, unknown>): Record<string, unknown> {
    const plain = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    for (const key of Object.keys(plain)) {
      if (AUDIT_REDACTED_KEYS.test(key)) delete plain[key];
    }
    return plain;
  }
}
