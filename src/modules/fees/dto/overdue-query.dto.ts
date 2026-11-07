import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { Currency } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

/** Filters of the overdue installments report. */
export class OverdueQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  sectionId?: number;

  /** Student name. */
  @IsOptional()
  @IsString()
  search?: string;
}
