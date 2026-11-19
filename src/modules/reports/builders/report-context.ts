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
  /**
   * What a builder passes as `take`: one more than the row limit, so `capped` can tell
   * "exactly the limit" from "more than the limit".
   */
  take: number;
}

/**
 * Refuses a report whose data reached the fetch cap (400 `report_too_many_rows`) instead
 * of building rows and totals from a silently cut list. Wrap EVERY fetch made with `ctx.take`.
 */
export function capped<T>(ctx: Pick<ReportContext, 'take'>, rows: T[], take = ctx.take): T[] {
  Ensure.custom(rows.length >= take, ErrorMessages.get('report_too_many_rows'), 400);
  return rows;
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

/** The same refusal for a paged read whose full `total` is known (students lists). */
export function cappedTotal(ctx: Pick<ReportContext, 'take'>, total: number): void {
  Ensure.custom(total >= ctx.take, ErrorMessages.get('report_too_many_rows'), 400);
}
