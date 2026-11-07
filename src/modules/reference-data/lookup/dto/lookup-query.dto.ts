import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/pagination/pagination.dto';

export class LookupQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
