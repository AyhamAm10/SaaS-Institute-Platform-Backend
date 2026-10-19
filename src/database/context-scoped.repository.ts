import { PrismaService } from './prisma.service';
import { TenantAwareRepository } from './tenant-aware.repository';
import { RequestContext } from '../context/request-context';

/**
 * Context-scoped repository that automatically layers operational dimensions
 * (Academic Year and Branch) on top of the mandatory tenant isolation.
 *
 * Scoping rules:
 * - instituteId: ALWAYS enforced (hard security boundary inherited from TenantAwareRepository).
 * - academicYearId: Automatically applied if present in RequestContext and defined in this repository's yearKey,
 *                   unless explicitly provided in the query.
 * - branchId: Automatically applied if present in RequestContext and defined in this repository's branchKey,
 *             unless explicitly provided in the query.
 *
 * Supports direct fields (e.g., 'academicYearId', 'branchId') and nested relations
 * (e.g., 'section.academicYearId', 'section.branchId').
 */
export abstract class ContextScopedRepository<
  T,
> extends TenantAwareRepository<T> {
  protected readonly yearKey?: string;
  protected readonly branchKey?: string;

  constructor(prisma: PrismaService, modelName: string) {
    super(prisma, modelName);
  }

  /**
   * Helper to check if a direct or dot-notated nested field is already
   * defined in a filter object.
   */
  private hasField(
    obj: Record<string, unknown> | undefined,
    path: string,
  ): boolean {
    if (!obj) return false;
    const parts = path.split('.');
    let curr: unknown = obj;
    for (const part of parts) {
      if (
        curr === undefined ||
        curr === null ||
        typeof curr !== 'object' ||
        !(part in curr)
      ) {
        return false;
      }
      curr = (curr as Record<string, unknown>)[part];
    }
    return curr !== undefined;
  }

  /**
   * Helper to set a direct or dot-notated nested property on an object.
   */
  private setNestedField(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const parts = path.split('.');
    let curr: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!curr[part] || typeof curr[part] !== 'object') {
        curr[part] = {};
      }
      curr = curr[part] as Record<string, unknown>;
    }
    curr[parts[parts.length - 1]] = value;
  }

  /**
   * Extends the tenant-scoped where clause with operational scopes
   * (academicYearId and branchId) from RequestContext.
   */
  protected override scopeWhere(
    where?: Record<string, unknown>,
  ): Record<string, unknown> {
    const baseWhere = super.scopeWhere(where);

    const yearId = RequestContext.getAcademicYearId();
    if (
      this.yearKey &&
      yearId !== undefined &&
      !this.hasField(where, this.yearKey)
    ) {
      this.setNestedField(baseWhere, this.yearKey, yearId);
    }

    const branchId = RequestContext.getBranchId();
    if (
      this.branchKey &&
      branchId !== undefined &&
      !this.hasField(where, this.branchKey)
    ) {
      this.setNestedField(baseWhere, this.branchKey, branchId);
    }

    return baseWhere;
  }

  /**
   * Automatically sets direct operational scope fields (academicYearId, branchId)
   * on record creation if present in RequestContext and not explicitly provided.
   */
  override async create(data: Record<string, unknown>): Promise<T> {
    const enrichedData = { ...data };

    const yearId = RequestContext.getAcademicYearId();
    if (
      this.yearKey &&
      !this.yearKey.includes('.') &&
      yearId !== undefined &&
      enrichedData[this.yearKey] === undefined
    ) {
      enrichedData[this.yearKey] = yearId;
    }

    const branchId = RequestContext.getBranchId();
    if (
      this.branchKey &&
      !this.branchKey.includes('.') &&
      branchId !== undefined &&
      enrichedData[this.branchKey] === undefined
    ) {
      enrichedData[this.branchKey] = branchId;
    }

    return super.create(enrichedData);
  }
}
