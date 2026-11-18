import { Inject, Injectable } from '@nestjs/common';
import { Currency, Notification } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../../common/time/timezone';

export interface InstallmentReminderRow {
  installmentId: number;
  studentId: number;
  amount: number;
  currency: Currency;
  dueDate: string;
}

export interface PendingMarksRow {
  examId: number;
  title: string;
  examDate: string;
  sectionId: number;
  subjectId: number;
  sectionName: string;
}

/**
 * State the hourly reminders look at (read-only). Each reminder is sent once
 * thanks to its dedupe key, so these queries may return the same rows again.
 */
@Injectable()
export class NotificationRemindersRepository extends TenantAwareRepository<Notification> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'notification');
  }

  /** Students marked ABSENT on the date (automatic or by hand). */
  async absentStudentIds(date: string): Promise<number[]> {
    const rows: { studentId: number }[] = await this.client.dailyAttendance.findMany({
      where: { instituteId: this.getInstituteId(), date: dateOnly(date), status: 'ABSENT' },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  /** Open installments of active contracts due between two local dates (inclusive). */
  async installmentsDue(from: string, to: string): Promise<InstallmentReminderRow[]> {
    return this.installments({ status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: dateOnly(from), lte: dateOnly(to) } });
  }

  async installmentsOverdue(): Promise<InstallmentReminderRow[]> {
    return this.installments({ status: 'OVERDUE' });
  }

  private async installments(where: Record<string, unknown>): Promise<InstallmentReminderRow[]> {
    const rows = await this.client.installment.findMany({
      where: {
        instituteId: this.getInstituteId(),
        ...where,
        subscription: { status: 'ACTIVE', student: { deletedAt: null } },
      },
      select: {
        id: true,
        amount: true,
        paidAmount: true,
        dueDate: true,
        subscription: { select: { studentId: true, currency: true } },
      },
      take: 2000,
    });
    return rows.map(
      (r: { id: number; amount: unknown; paidAmount: unknown; dueDate: Date; subscription: { studentId: number; currency: Currency } }) => ({
        installmentId: r.id,
        studentId: r.subscription.studentId,
        amount: Math.max(0, Number(r.amount) - Number(r.paidAmount)),
        currency: r.subscription.currency,
        dueDate: r.dueDate.toISOString().slice(0, 10),
      }),
    );
  }

  /** Exams held between two local dates that still have no result at all for some student. */
  async examsWithoutMarks(from: string, to: string): Promise<PendingMarksRow[]> {
    const rows = await this.client.exam.findMany({
      where: {
        instituteId: this.getInstituteId(),
        examDate: { gte: dateOnly(from), lte: dateOnly(to) },
        NOT: { results: { some: {} } },
      },
      select: {
        id: true,
        title: true,
        examDate: true,
        sectionId: true,
        subjectId: true,
        section: { select: { name: true } },
      },
      take: 500,
    });
    return rows.map(
      (r: { id: number; title: string; examDate: Date; sectionId: number; subjectId: number; section: { name: string } }) => ({
        examId: r.id,
        title: r.title,
        examDate: r.examDate.toISOString().slice(0, 10),
        sectionId: r.sectionId,
        subjectId: r.subjectId,
        sectionName: r.section.name,
      }),
    );
  }

  /** Teacher of a (section, subject) pair, if assigned. */
  async teacherOf(sectionId: number, subjectId: number): Promise<number | null> {
    const row: { teacherId: number | null } | null = await this.client.sectionSubject.findFirst({
      where: { instituteId: this.getInstituteId(), sectionId, subjectId },
      select: { teacherId: true },
    });
    return row?.teacherId ?? null;
  }
}
