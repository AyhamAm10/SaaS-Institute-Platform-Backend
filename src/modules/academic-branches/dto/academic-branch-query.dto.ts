import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

export class AcademicBranchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
