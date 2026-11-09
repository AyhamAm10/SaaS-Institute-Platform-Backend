/**
 * Response contract of the guardian / student apps (`/api/mobile/...`).
 * Dates are `YYYY-MM-DD`, times `HH:mm`, timestamps ISO strings; money is a
 * number in its own currency (SYP and USD are never mixed).
 */

export type MobileRole = 'FAMILY' | 'STUDENT';
export type MobileCurrency = 'SYP' | 'USD';
export type MobileAttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'EXCUSED';
export type MobileWeekday =
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

export interface NamedRef {
  id: number;
  name: string;
}

export interface MobileChild {
  id: number;
  fullName: string;
  gender: 'MALE' | 'FEMALE';
  section: NamedRef | null;
  branch: NamedRef;
  statusName: string | null;
}

export interface MobileMe {
  role: MobileRole;
  userId: number;
  phone: string;
  displayName: string;
  institute: {
    id: number;
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    phone: string | null;
    address: string | null;
  };
  children: MobileChild[];
}

export interface MobileLesson {
  id: number;
  subject: string;
  startTime: string;
  endTime: string;
  room: string | null;
  teacher: string | null;
}

export interface MobileAttendanceCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export interface MobileMarkSummary {
  examId: number;
  subject: string;
  title: string;
  date: string;
  score: number;
  max: number;
  percent: number;
}

export interface MobileUpcomingExam {
  examId: number;
  subject: string;
  title: string;
  date: string;
}

export interface MobileCurrencyTotals {
  currency: MobileCurrency;
  total: number;
  paid: number;
  remaining: number;
  overdue: number;
}

export interface MobileOverview {
  student: { id: number; fullName: string; section: NamedRef | null; branch: NamedRef };
  today: {
    date: string;
    isWorkingDay: boolean;
    attendance: {
      status: MobileAttendanceStatus | null;
      checkInAt: string | null;
      checkOutAt: string | null;
    };
    lessons: MobileLesson[];
  };
  attendance30d: MobileAttendanceCounts & { ratePercent: number | null };
  marks: {
    averagePercent: number | null;
    latest: MobileMarkSummary[];
    upcoming: MobileUpcomingExam[];
  };
  /** null for STUDENT accounts. */
  finance: null | {
    currencies: MobileCurrencyTotals[];
    nextDue: { amount: number; currency: MobileCurrency; dueDate: string } | null;
  };
}

export interface MobileAttendanceMonth {
  month: string;
  days: {
    date: string;
    status: MobileAttendanceStatus;
    checkInAt: string | null;
    checkOutAt: string | null;
    note: string | null;
  }[];
  counts: MobileAttendanceCounts;
  ratePercent: number | null;
}

export interface MobileTimetable {
  days: {
    weekday: MobileWeekday;
    slots: {
      startTime: string;
      endTime: string;
      subject: string;
      teacher: string | null;
      room: string | null;
    }[];
  }[];
}

export interface MobileResults {
  averagePercent: number | null;
  subjects: {
    subjectId: number;
    subject: string;
    averagePercent: number | null;
    results: {
      examId: number;
      title: string;
      date: string;
      score: number | null;
      max: number;
      percent: number | null;
      status: string;
    }[];
  }[];
  upcoming: MobileUpcomingExam[];
}

export interface MobileFinance {
  totals: MobileCurrencyTotals[];
  contracts: {
    id: number;
    yearName: string;
    currency: MobileCurrency;
    total: number;
    discount: number;
    paid: number;
    remaining: number;
    installments: {
      id: number;
      number: number;
      dueDate: string;
      amount: number;
      paid: number;
      remaining: number;
      status: 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE' | 'CANCELLED';
    }[];
  }[];
  /** Newest first. */
  payments: {
    id: number;
    receiptNumber: string;
    date: string;
    amount: number;
    currency: MobileCurrency;
    method: string;
    status: 'ACTIVE' | 'CANCELLED';
  }[];
}

export interface MobileProfile {
  fullName: string;
  gender: 'MALE' | 'FEMALE';
  birthDate: string | null;
  section: NamedRef | null;
  branch: NamedRef;
  statusName: string | null;
  bus: { name: string; driverName: string | null; driverPhone: string | null } | null;
  /** Only for FAMILY accounts. */
  family: null | { familyName: string; phone: string | null };
  institute: { name: string; phone: string | null; address: string | null };
}
