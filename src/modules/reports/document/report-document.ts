import { Currency } from '@prisma/client';

/**
 * Report document (D3): the one shape every report is built into. The
 * dashboard renders it (screen + print) and the Excel writer reads it, so a
 * report is defined once and formatted the same everywhere.
 *
 * Cells are typed by their column `kind`; money cells carry their own
 * currency and are never summed across currencies.
 */

export type Tone = 'brand' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface MoneyCell {
  amount: number;
  currency: Currency;
}

export interface BadgeCell {
  text: string;
  tone: Tone;
}

/** text / phone: string · number / percent / mark: number · date: YYYY-MM-DD · money: MoneyCell · badge: BadgeCell. */
export type Cell = string | number | MoneyCell | BadgeCell | null;

export type ColumnKind = 'text' | 'number' | 'percent' | 'mark' | 'date' | 'money' | 'badge' | 'phone' | 'blank';

export interface ReportColumn {
  key: string;
  title: string;
  kind: ColumnKind;
  /** Relative width hint (1 = normal). */
  width?: number;
}

export type ReportRow = Record<string, Cell>;

export interface StatItem {
  label: string;
  value: Cell;
  /** Explicit kind (percent, mark); inferred from the value otherwise. */
  kind?: ColumnKind;
  tone?: Tone;
  hint?: string;
}

export interface FieldItem {
  label: string;
  value: Cell;
}

export interface BarItem {
  label: string;
  /** 0..100 */
  value: number;
  caption?: string;
  tone?: Tone;
}

export type ReportBlock =
  | { type: 'stats'; title?: string; items: StatItem[] }
  | { type: 'fields'; title?: string; columns?: 2 | 3 | 4; items: FieldItem[] }
  | {
      type: 'table';
      title?: string;
      columns: ReportColumn[];
      rows: ReportRow[];
      /** Totals rows (one per currency for money). */
      totals?: ReportRow[];
      emptyText?: string;
      /** Draw empty writing lines (sheets to fill by hand). */
      ruled?: boolean;
    }
  | {
      type: 'grid';
      title?: string;
      corner: string;
      columns: string[];
      rows: { label: string; sub?: string; cells: (string | null)[] }[];
      /** Draw empty boxes to fill by hand. */
      ruled?: boolean;
    }
  | { type: 'bars'; title?: string; items: BarItem[] }
  | { type: 'note'; tone: Tone; text: string }
  | { type: 'signatures'; items: string[] };

export interface ReportMetaItem {
  label: string;
  value: string;
}

export interface ReportVerification {
  number: string;
  token: string;
}

export interface ReportDocument {
  key: string;
  title: string;
  subtitle?: string;
  orientation: 'portrait' | 'landscape';
  /** Criteria shown under the title (period, section, ...). */
  meta: ReportMetaItem[];
  blocks: ReportBlock[];
  generatedAt: string;
  generatedBy: string | null;
  verification?: ReportVerification;
}

/** Body built by a report: the service adds key, time, author and verification. */
export type ReportBody = Omit<ReportDocument, 'key' | 'generatedAt' | 'generatedBy' | 'verification'> & {
  /** Verification summary (short lines kept inside the signed token). */
  verify?: { subject: string; lines: string[] };
};

/** Money cell helper. */
export function money(amount: number, currency: Currency): MoneyCell {
  return { amount, currency };
}

export function badge(text: string, tone: Tone): BadgeCell {
  return { text, tone };
}
