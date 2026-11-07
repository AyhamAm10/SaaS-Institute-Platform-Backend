import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { LookupQueryDto } from '../../lookup/dto/lookup-query.dto';

export class CreateSchoolDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name: string;

  /** Optional city; `null` on update clears it. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  cityId?: number | null;
}

export class UpdateSchoolDto extends PartialType(CreateSchoolDto) {}

export class SchoolQueryDto extends LookupQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  cityId?: number;
}
