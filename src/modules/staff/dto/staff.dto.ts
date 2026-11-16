import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { STAFF_ROLES } from '../../../common/types/user-role.enum';
import type { StaffRole } from '../../../common/types/user-role.enum';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsIn(STAFF_ROLES)
  role!: StaffRole;
}

/** Name and / or role (the phone is the login and does not change here). */
export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;
}

export class StaffQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;
}

/** A staff account as returned by the API (never the password hash). */
export interface StaffMember {
  id: number;
  fullName: string;
  phone: string;
  role: string;
  createdAt: Date;
}
