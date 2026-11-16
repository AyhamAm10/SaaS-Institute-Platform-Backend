import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

/** The account kinds of the accounts screen (one sub-tab each). */
export const ACCOUNT_TYPES = [
  'staff',
  'teachers',
  'families',
  'students',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export class AccountsQueryDto extends PaginationQueryDto {
  @IsIn(ACCOUNT_TYPES)
  type!: AccountType;

  @IsOptional()
  @IsString()
  search?: string;

  /** Omitted: both. */
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class SetAccountActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

/** A student account needs its own phone (students have none on file). */
export class CreateStudentAccountDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  studentId!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'phone must be a valid phone number (8-15 digits)',
  })
  phone!: string;
}

/** One row of the accounts screen (never the password hash). */
export interface AccountItem {
  id: number;
  fullName: string;
  phone: string;
  role: string;
  isActive: boolean;
  /** Still on the default password (new or reset account). */
  mustChangePassword: boolean;
  createdAt: Date;
  /** Family name(s), student name or specialization, by account type. */
  linkedTo: string | null;
}
