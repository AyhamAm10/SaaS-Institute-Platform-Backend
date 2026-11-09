import { StudentFinance } from '../fees/student-finance';
import { MobileStudentRow } from '../students/student.repository';
import { MobileChild, MobileFinance } from './mobile-api.types';

/** Empty strings (columns that are NOT NULL in the database) become null. */
export function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

/** Section of the child's active enrollment, or null. */
export function sectionOf(row: MobileStudentRow): MobileChild['section'] {
  const section = row.studentEnrollments[0]?.section;
  return section ? { id: section.id, name: section.name } : null;
}

export function toChild(row: MobileStudentRow): MobileChild {
  return {
    id: row.id,
    fullName: row.fullName,
    gender: row.gender,
    section: sectionOf(row),
    branch: { id: row.branch.id, name: row.branch.name },
    statusName: row.status?.name ?? null,
  };
}

export function toMobileFinance(finance: StudentFinance): MobileFinance {
  return {
    totals: finance.totals,
    contracts: finance.contracts.map((c) => ({
      id: c.id,
      yearName: c.yearName,
      currency: c.currency,
      total: c.total,
      discount: c.discount,
      paid: c.paid,
      remaining: c.remaining,
      installments: c.installments.map((i) => ({
        id: i.id,
        number: i.installmentNumber,
        dueDate: i.dueDate,
        amount: i.amount,
        paid: i.paid,
        remaining: i.remaining,
        // The database says PENDING for "not paid, not yet due"; the app says DUE
        status: i.status === 'PENDING' ? 'DUE' : i.status,
      })),
    })),
    payments: finance.payments.map((p) => ({
      id: p.id,
      receiptNumber: String(p.receiptNumber),
      date: p.date,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      status: p.status,
    })),
  };
}
