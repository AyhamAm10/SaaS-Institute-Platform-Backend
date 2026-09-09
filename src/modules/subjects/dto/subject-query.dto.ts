import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

/**
 * Query parameters for filtering and paginating subjects.
 */
export class SubjectQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
