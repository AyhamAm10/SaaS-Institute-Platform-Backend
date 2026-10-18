import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

export class StudentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  branchId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  sectionId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  familyId?: number;
}
