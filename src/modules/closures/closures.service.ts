import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { StudyNotificationEventsService } from '../notifications/study-notification-events.service';
import { ClosureScope } from '@prisma/client';
import { ClosureRepository, ClosureWithRefs } from './closure.repository';
import { BranchRepository } from '../branches/branch.repository';
import { SectionRepository } from '../sections/section.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { dateOnly, daysBetween } from '../../common/time/timezone';
import {
  ClosureAudience,
  ClosureInfo,
  MAX_CLOSURE_DAYS,
  findCovering,
} from './closures.rules';
import {
  ClosureQueryDto,
  CreateClosureDto,
  UpdateClosureDto,
} from './dto/closure.dto';

const fail = (key: string): never => {
  throw new BadRequestException(ErrorMessages.get(key));
};

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/** API shape of a closure. */
export interface ClosureView {
  id: number;
  scope: ClosureScope;
  branchId: number | null;
  branchName: string | null;
  fromDate: string;
  toDate: string;
  reason: string;
  sections: { id: number; name: string }[];
}

function toView(c: ClosureWithRefs): ClosureView {
  return {
    id: c.id,
    scope: c.scope,
    branchId: c.branchId,
    branchName: c.branch?.name ?? null,
    fromDate: ymd(c.fromDate),
    toDate: ymd(c.toDate),
    reason: c.reason,
    sections: c.sections.map((s) => s.section),
  };
}

function toInfo(c: ClosureWithRefs): ClosureInfo {
  return {
    id: c.id,
    scope: c.scope,
    branchId: c.branchId,
    fromDate: ymd(c.fromDate),
    toDate: ymd(c.toDate),
    reason: c.reason,
    sectionIds: c.sections.map((s) => s.section.id),
  };
}

/** Validated, normalized closure input (create and update share it). */
interface ClosureInput {
  scope: ClosureScope;
  branchId: number | null;
  sectionIds: number[];
  fromDate: string;
  toDate: string;
  reason: string;
}

/**
 * Closures / holidays (عطل): days on which attendance is not taken, for the
 * whole institute, one branch or some sections. Owns the rules; attendance
 * only asks `findCovering` / `findInfoBetween` and never reads the tables.
 */
@Injectable()
export class ClosuresService {
  constructor(
    @Inject(ClosureRepository) private readonly repository: ClosureRepository,
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
    @Inject(SectionRepository)
    private readonly sectionRepository: SectionRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
    /** Optional so unit tests that do not cover notifications need no mock. */
    @Optional()
    @Inject(StudyNotificationEventsService)
    private readonly events?: StudyNotificationEventsService,
  ) {}

  async findAll(query: ClosureQueryDto): Promise<ClosureView[]> {
    const rows = await this.repository.findOverlapping(query.from, query.to);
    return rows.map(toView);
  }

  async create(dto: CreateClosureDto): Promise<ClosureView> {
    const input = await this.validate({
      scope: dto.scope,
      branchId: dto.branchId ?? null,
      sectionIds: dto.sectionIds ?? [],
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      reason: dto.reason,
    });
    const id = await this.transactionHelper.executeInTransaction(async () => {
      const row = await this.repository.create(this.columns(input));
      await this.repository.replaceSections(row.id, input.sectionIds);
      return row.id;
    });
    void this.events?.closureCreated({
      closureId: id,
      reason: input.reason,
      fromDate: input.fromDate,
      toDate: input.toDate,
      branchId: input.branchId,
      sectionIds: input.sectionIds,
    });
    return this.getView(id);
  }

  async update(id: number, dto: UpdateClosureDto): Promise<ClosureView> {
    const existing = await this.repository.findWithRefs(id);
    Ensure.exists(existing, 'Closure');
    const current = toView(existing);
    const scope = dto.scope ?? current.scope;
    // A new scope drops the old branch / sections instead of carrying them over
    const carry = scope === current.scope;
    const input = await this.validate({
      scope,
      branchId: dto.branchId ?? (carry ? current.branchId : null),
      sectionIds:
        dto.sectionIds ?? (carry ? current.sections.map((s) => s.id) : []),
      fromDate: dto.fromDate ?? current.fromDate,
      toDate: dto.toDate ?? current.toDate,
      reason: dto.reason ?? current.reason,
    });
    await this.transactionHelper.executeInTransaction(async () => {
      await this.repository.update(id, this.columns(input));
      await this.repository.replaceSections(id, input.sectionIds);
    });
    return this.getView(id);
  }

  /** Removes the closure: its days count as ordinary days again (nothing is back-filled). */
  async remove(id: number): Promise<void> {
    const existing = await this.repository.findById(id);
    Ensure.exists(existing, 'Closure');
    await this.transactionHelper.executeInTransaction(async () => {
      await this.repository.replaceSections(id, []);
      await this.repository.delete(id);
    });
  }

  /** Closures overlapping [from, to], for attendance (jobs and checks). */
  async findInfoBetween(from: string, to: string): Promise<ClosureInfo[]> {
    return (await this.repository.findOverlapping(from, to)).map(toInfo);
  }

  /** The closure that covers `date` for the audience, or null. */
  async findCovering(
    date: string,
    audience: ClosureAudience,
  ): Promise<ClosureInfo | null> {
    return findCovering(await this.findInfoBetween(date, date), date, audience);
  }

  private async getView(id: number): Promise<ClosureView> {
    const row = await this.repository.findWithRefs(id);
    Ensure.exists(row, 'Closure');
    return toView(row);
  }

  private columns(input: ClosureInput): Record<string, unknown> {
    return {
      scope: input.scope,
      branchId: input.branchId,
      fromDate: dateOnly(input.fromDate),
      toDate: dateOnly(input.toDate),
      reason: input.reason,
    };
  }

  /** Rules shared by create and update; returns the normalized input. */
  private async validate(input: ClosureInput): Promise<ClosureInput> {
    if (input.toDate < input.fromDate) fail('closure_invalid_range');
    if (daysBetween(input.fromDate, input.toDate) + 1 > MAX_CLOSURE_DAYS)
      fail('closure_range_too_long');

    if (input.scope === ClosureScope.BRANCH) {
      if (input.branchId === null) fail('closure_branch_required');
      if (input.sectionIds.length > 0) fail('closure_scope_invalid');
      Ensure.exists(
        await this.branchRepository.findById(input.branchId!),
        'Branch',
      );
    } else if (input.scope === ClosureScope.SECTION) {
      if (input.sectionIds.length === 0) fail('closure_sections_required');
      if (input.branchId !== null) fail('closure_scope_invalid');
      // Sections are read through the operational context (branch + year)
      const found = await this.sectionRepository.findMany({
        where: { id: { in: input.sectionIds } },
      });
      if (found.length !== input.sectionIds.length)
        fail('closure_sections_invalid');
    } else if (input.branchId !== null || input.sectionIds.length > 0) {
      fail('closure_scope_invalid');
    }
    return input;
  }
}
