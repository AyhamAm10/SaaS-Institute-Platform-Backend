import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, Max } from 'class-validator';

/**
 * Reusable pagination query DTO.
 * Extend or compose with this DTO in feature-specific query DTOs.
 *
 * Defaults: page = 1, limit = 20 (max 100).
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit: number = 20;

  /** Calculate the offset for Prisma `skip`. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
