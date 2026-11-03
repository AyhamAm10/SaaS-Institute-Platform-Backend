import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  INSTITUTE_CODE_PATTERN,
  normalizeInstituteCode,
} from '../../../common/types/institute-code';

/**
 * DTO for creating an institute and its initial administrator account.
 */
export class CreateInstituteDto {
  // ── Institute Details ──────────────────────────────────────────────
  @IsNotEmpty()
  @IsString()
  name: string;

  /** Login code; generated automatically when omitted. */
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeInstituteCode(value) : value,
  )
  @Matches(INSTITUTE_CODE_PATTERN)
  code?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  // ── Admin User Details ─────────────────────────────────────────────
  @IsNotEmpty()
  @IsString()
  adminFullName: string;

  @IsNotEmpty()
  @IsString()
  adminPhone: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  adminPassword: string;
}
