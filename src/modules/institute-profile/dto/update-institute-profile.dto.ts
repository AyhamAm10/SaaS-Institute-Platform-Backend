import { IsOptional, IsString, IsTimeZone } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateInstituteProfileDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  address?: string;

  @IsOptional()
  @IsString()
  @IsTimeZone()
  timezone?: string;
}

