import { Type } from 'class-transformer';
import { Currency } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

/**
 * DTO for creating a new section.
 *
 * All section inputs are validated at the HTTP boundary.
 * instituteId is intentionally omitted — it is always resolved
 * from the verified request context (multi-tenant isolation).
 */
export class CreateSectionDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  academicBranchId: number;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  branchId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  academicYearId?: number;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  feeAmount: number;

  /** SYP (default) or USD; contracts default to this currency. */
  @IsOptional()
  @IsEnum(Currency)
  feeCurrency?: Currency;
}
