import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { AuditAction } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

/** Filters of the audit viewer (dates are local to the institute, inclusive). */
export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  /** Model name as written by the audited repositories (e.g. `student`). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userId?: number;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  /** With `entity`: the history of one record. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  entityId?: number;
}

/** One changed field of an UPDATE entry. */
export interface AuditFieldChange {
  field: string;
  before: string;
  after: string;
}

export interface AuditEntryView {
  id: number;
  createdAt: Date;
  userId: number | null;
  /** Null when the account no longer exists or the change was made by the system. */
  userName: string | null;
  entity: string;
  entityId: number;
  action: AuditAction;
  /** A name / title found in the record, to recognise it. */
  label: string | null;
  changes: AuditFieldChange[];
}
