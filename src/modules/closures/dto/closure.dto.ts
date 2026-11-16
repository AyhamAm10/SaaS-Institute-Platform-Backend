import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ClosureScope } from '@prisma/client';

/** Sections of a SECTION-scope closure (all must belong to the institute). */
const SECTION_LIMIT = 200;

export class CreateClosureDto {
  @IsEnum(ClosureScope)
  scope!: ClosureScope;

  /** Required when scope = BRANCH. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  branchId?: number;

  /** Required (non-empty) when scope = SECTION. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SECTION_LIMIT)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  sectionIds?: number[];

  /** Local date `YYYY-MM-DD`, inclusive. */
  @IsDateString({ strict: true })
  fromDate!: string;

  /** Local date `YYYY-MM-DD`, inclusive. */
  @IsDateString({ strict: true })
  toDate!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason!: string;
}

export class UpdateClosureDto {
  @IsOptional()
  @IsEnum(ClosureScope)
  scope?: ClosureScope;

  @IsOptional()
  @IsInt()
  @IsPositive()
  branchId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SECTION_LIMIT)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  sectionIds?: number[];

  @IsOptional()
  @IsDateString({ strict: true })
  fromDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  toDate?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason?: string;
}

export class ClosureQueryDto {
  /** Closures that end on or after this local date. */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  /** Closures that start on or before this local date. */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
