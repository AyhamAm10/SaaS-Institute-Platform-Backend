import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { Currency } from '@prisma/client';

/**
 * DTO for dedicated section fee update endpoint.
 */
export class UpdateSectionFeeDto {
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  feeAmount: number;

  /** SYP (default) or USD. */
  @IsOptional()
  @IsEnum(Currency)
  feeCurrency?: Currency;
}
