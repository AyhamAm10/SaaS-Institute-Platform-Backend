import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { Currency, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

/** Record a payment on a contract (allocated FIFO over its installments). */
export class CreatePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  amount!: number;

  /** Default: the contract currency. */
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  /** SYP per 1 USD — required when `currency` differs from the contract. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  /** ISO instant; default: now. */
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CancelPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class PaymentQueryDto extends PaginationQueryDto {
  /** Local dates `YYYY-MM-DD` (inclusive) in the institute time zone. */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  receiptNumber?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  studentId?: number;

  /** Student name. */
  @IsOptional()
  @IsString()
  search?: string;
}
