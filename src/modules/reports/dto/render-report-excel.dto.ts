import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { REPORT_ROW_LIMIT } from '../reports.rules';
import type {
  ReportBlock,
  ReportDocument,
  ReportMetaItem,
  ReportVerification,
} from '../document/report-document';

@ValidatorConstraint({ name: 'TableRowsLimit', async: false })
export class TableRowsLimitConstraint implements ValidatorConstraintInterface {
  validate(blocks: ReportBlock[], _args: ValidationArguments) {
    if (!Array.isArray(blocks)) return false;
    for (const b of blocks) {
      if (b && b.type === 'table' && Array.isArray(b.rows)) {
        if (b.rows.length > REPORT_ROW_LIMIT) {
          return false;
        }
      }
    }
    return true;
  }

  defaultMessage(_args: ValidationArguments) {
    return `Table rows must not exceed ${REPORT_ROW_LIMIT}`;
  }
}

@ValidatorConstraint({ name: 'PayloadSizeLimit', async: false })
export class PayloadSizeLimitConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    try {
      const raw = JSON.stringify(args.object);
      return raw.length <= 2 * 1024 * 1024;
    } catch {
      return false;
    }
  }

  defaultMessage(_args: ValidationArguments) {
    return 'Document payload must not exceed 2MB';
  }
}

export class RenderReportExcelDto implements ReportDocument {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Validate(PayloadSizeLimitConstraint)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @IsIn(['portrait', 'landscape'])
  orientation!: 'portrait' | 'landscape';

  @IsArray()
  meta!: ReportMetaItem[];

  @IsArray()
  @ArrayMaxSize(20)
  @Validate(TableRowsLimitConstraint)
  blocks!: ReportBlock[];

  @IsString()
  generatedAt!: string;

  @IsOptional()
  generatedBy!: string | null;

  @IsOptional()
  verification?: ReportVerification;
}
