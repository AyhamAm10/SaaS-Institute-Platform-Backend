import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, Min } from 'class-validator';

/**
 * DTO for dedicated section fee update endpoint.
 */
export class UpdateSectionFeeDto {
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  feeAmount: number;
}
