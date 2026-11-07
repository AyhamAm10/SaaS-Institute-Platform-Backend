import { Ensure } from '../../../common/errors/ensure';
import { ErrorMessages } from '../../../common/errors/error-messages';
import { ReportQueryDto } from '../dto/report-query.dto';
import { ReportBody } from '../document/report-document';

/** Everything a report builder needs besides its domain services. */
export interface ReportContext {
  query: ReportQueryDto;
  /** Institute-local today (YYYY-MM-DD). */
  today: string;
  timeZone: string;
  /** Header branch (operational context), when one is chosen. */
  branchId?: number;
  /** Header (or current) academic year. */
  year: ReportYear | null;
  /** Row cap of a synchronous report. */
  take: number;
}

export type ReportBuilder = (ctx: ReportContext) => Promise<ReportBody>;

/** A group of builders (one per report key) provided by one class. */
export interface ReportBuilderGroup {
  readonly builders: Record<string, ReportBuilder>;
}

/** Year required by a builder (400 report_no_academic_year otherwise). */
export function requireYear(ctx: ReportContext): ReportYear {
  Ensure.custom(!ctx.year, ErrorMessages.get('report_no_academic_year'), 400);
  return ctx.year!;
}

export interface ReportYear {
  id: number;
  name: string;
  /** Local dates (YYYY-MM-DD). */
  startDate: string;
  endDate: string;
}
