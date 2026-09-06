import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * DTO for creating an institute and its initial administrator account.
 */
export class CreateInstituteDto {
  // ── Institute Details ──────────────────────────────────────────────
  @IsNotEmpty()
  @IsString()
  name: string;

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
