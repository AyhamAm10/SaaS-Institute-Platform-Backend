import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

export class MobileAccountQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['FAMILY', 'STUDENT'])
  role?: 'FAMILY' | 'STUDENT';

  @IsOptional()
  @IsString()
  search?: string;
}

