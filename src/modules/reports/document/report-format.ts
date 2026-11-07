import { AttendanceStatus, Currency, ExamResultStatus, PaymentMethod } from '@prisma/client';
import { currencyScale } from '../../../common/money/money';
import { getLocalParts } from '../../../common/time/timezone';
import { BadgeCell, badge } from './report-document';

/**
 * Arabic labels and text formatting for report headers, verification lines
 * and badges. Table values stay typed (the dashboard / Excel format them).
 */

export const CURRENCY_LABELS: Record<Currency, string> = { SYP: 'ل.س', USD: '$' };

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'نقداً',
  BANK_TRANSFER: 'تحويل بنكي',
  OTHER: 'أخرى',
};

export const WEEKDAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const GENDER_LABELS: Record<string, string> = { MALE: 'ذكر', FEMALE: 'أنثى' };

export const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'فعال',
  TRANSFERRED: 'منقول',
  WITHDRAWN: 'منسحب',
  COMPLETED: 'منتهٍ',
};

const ATTENDANCE_BADGES: Record<AttendanceStatus, BadgeCell> = {
  PRESENT: badge('حاضر', 'success'),
  LATE: badge('متأخر', 'warning'),
  ABSENT: badge('غائب', 'danger'),
  EXCUSED: badge('بعذر', 'info'),
};

const RESULT_BADGES: Record<ExamResultStatus, BadgeCell> = {
  PASSED: badge('ناجح', 'success'),
  FAILED: badge('راسب', 'danger'),
  ABSENT: badge('غائب', 'warning'),
  PENDING: badge('لم تُرصد', 'neutral'),
};

export function attendanceBadge(status: AttendanceStatus): BadgeCell {
  return ATTENDANCE_BADGES[status];
}

export function resultBadge(status: ExamResultStatus): BadgeCell {
  return RESULT_BADGES[status];
}

/** "150,000 ل.س" / "12.50 $" (digits grouped, currency precision). */
export function moneyText(amount: number, currency: Currency): string {
  const digits = currencyScale(currency);
  const text = amount.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${text} ${CURRENCY_LABELS[currency]}`;
}

/** Local date of a stored `@db.Date` value. */
export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** "2026/11/07" for headers. */
export function dateText(localDate: string): string {
  return localDate.replaceAll('-', '/');
}

export function periodText(from: string, to: string): string {
  return from === to ? dateText(from) : `${dateText(from)} — ${dateText(to)}`;
}

/** Local `HH:mm` of an instant in the institute time zone. */
export function timeText(at: Date, timeZone: string): string {
  const minutes = getLocalParts(at, timeZone).minutesOfDay;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
