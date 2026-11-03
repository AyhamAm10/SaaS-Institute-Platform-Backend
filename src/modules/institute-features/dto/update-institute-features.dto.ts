import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { FeatureKey } from '@prisma/client';

export class FeatureToggleDto {
  @IsEnum(FeatureKey)
  key: FeatureKey;

  @IsBoolean()
  enabled: boolean;
}

export class UpdateInstituteFeaturesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureToggleDto)
  features: FeatureToggleDto[];
}
