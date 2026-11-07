import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateBusDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  /** Optional: defaults to the active branch (X-Branch-Id) or the default branch. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  branchId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  driverName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{8,15}$/, { message: 'driverPhone must be 8-15 digits' })
  driverPhone?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** A bus cannot move between branches (its students belong to that branch). */
export class UpdateBusDto extends PartialType(
  OmitType(CreateBusDto, ['branchId'] as const),
) {}
