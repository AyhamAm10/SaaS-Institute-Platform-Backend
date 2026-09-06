import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

/**
 * Query parameters for filtering and paginating sections.
 */
export class SectionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  academicYearId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  branchId?: number;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
