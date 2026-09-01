/**
 * Prisma-compatible filter builder.
 *
 * Constructs Prisma `where` objects from query parameters using a fluent API.
 * Each method is a no-op when the value is undefined/null, making it safe
 * to chain with optional query params.
 *
 * Usage:
 *   const where = new FilterBuilder<Prisma.UserWhereInput>()
 *     .contains('fullName', query.search)
 *     .equals('role', query.role)
 *     .boolean('isActive', query.isActive)
 *     .build();
 *
 * The builder does NOT try to abstract every Prisma feature.
 * For complex queries, use raw Prisma where objects directly.
 */
export class FilterBuilder<
  TWhere extends Record<string, unknown> = Record<string, unknown>,
> {
  private readonly conditions: Record<string, unknown> = {};

  /** Exact equality match. */
  equals(field: string, value: unknown): this {
    if (value !== undefined && value !== null) {
      this.conditions[field] = value;
    }
    return this;
  }

  /** Case-insensitive partial match (Prisma `contains`). */
  contains(field: string, value: string | undefined, caseInsensitive = true): this {
    if (value !== undefined && value !== null) {
      this.conditions[field] = {
        contains: value,
        ...(caseInsensitive && { mode: 'insensitive' as const }),
      };
    }
    return this;
  }

  /** Match any value in a list (Prisma `in`). */
  in(field: string, values: unknown[] | undefined): this {
    if (values !== undefined && values.length > 0) {
      this.conditions[field] = { in: values };
    }
    return this;
  }

  /** Exclude values in a list (Prisma `notIn`). */
  notIn(field: string, values: unknown[] | undefined): this {
    if (values !== undefined && values.length > 0) {
      this.conditions[field] = { notIn: values };
    }
    return this;
  }

  /** Numeric or date range (Prisma `gte`/`lte`). */
  range(field: string, min?: number | Date, max?: number | Date): this {
    if (min !== undefined || max !== undefined) {
      const condition: Record<string, unknown> = {};
      if (min !== undefined) condition['gte'] = min;
      if (max !== undefined) condition['lte'] = max;
      this.conditions[field] = condition;
    }
    return this;
  }

  /** Case-insensitive prefix match. */
  startsWith(field: string, value: string | undefined): this {
    if (value !== undefined && value !== null) {
      this.conditions[field] = { startsWith: value, mode: 'insensitive' as const };
    }
    return this;
  }

  /** Case-insensitive suffix match. */
  endsWith(field: string, value: string | undefined): this {
    if (value !== undefined && value !== null) {
      this.conditions[field] = { endsWith: value, mode: 'insensitive' as const };
    }
    return this;
  }

  /** Boolean exact match. */
  boolean(field: string, value: boolean | undefined): this {
    if (value !== undefined) {
      this.conditions[field] = value;
    }
    return this;
  }

  /** Relation filter (pass a Prisma-compatible nested where). */
  relation(field: string, where: Record<string, unknown> | undefined): this {
    if (where !== undefined && Object.keys(where).length > 0) {
      this.conditions[field] = where;
    }
    return this;
  }

  /** Arbitrary condition for cases the builder doesn't cover. */
  custom(field: string, condition: unknown): this {
    if (condition !== undefined && condition !== null) {
      this.conditions[field] = condition;
    }
    return this;
  }

  /** Build the final Prisma where object. */
  build(): TWhere {
    return { ...this.conditions } as TWhere;
  }
}
