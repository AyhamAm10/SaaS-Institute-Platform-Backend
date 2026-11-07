import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Currency } from '@prisma/client';

/**
 * Create (or preview) the contract of an enrollment.
 * Amount and currency default to the section fee.
 */
export class CreateContractDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  grossAmount?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  discountReason?: string;

  /** Optional down payment: becomes installment #1, due on startDate. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  firstPaymentAmount?: number;

  @IsInt()
  @Min(1)
  @Max(60)
  @Type(() => Number)
  numberOfInstallments!: number;

  /** Local date `YYYY-MM-DD`; default: today in the institute. */
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;
}

/**
 * Change a contract after creation: only the discount and the installments
 * with nothing paid are regenerated (role.md §10.3).
 */
export class UpdateContractDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  discountReason?: string;

  /** Number of NEW installments to spread the unpaid balance over. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  @Type(() => Number)
  numberOfInstallments?: number;

  /** First due date of the regenerated installments (local `YYYY-MM-DD`). */
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;
}
