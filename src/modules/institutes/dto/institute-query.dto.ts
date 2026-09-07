import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

/**
 * Query parameters for filtering and paginating institutes.
 */
export class InstituteQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
