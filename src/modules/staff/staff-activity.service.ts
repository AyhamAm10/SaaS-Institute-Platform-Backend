import { Inject, Injectable } from '@nestjs/common';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { localMidnightUtc, shiftLocalDate } from '../../common/time/timezone';
import { AuditLogRepository } from './audit-log.repository';
import { StaffRepository } from './staff.repository';

/**
 * Who changed what (D3 "staff activity"): reads the audit log of the
 * institute and the names of the people behind it. Staff-owned because the
 * audit log is about the staff's actions.
 */
@Injectable()
export class StaffActivityService {
  constructor(
    @Inject(AuditLogRepository)
    private readonly auditLogRepository: AuditLogRepository,
    @Inject(StaffRepository) private readonly staffRepository: StaffRepository,
    @Inject(InstituteClockService)
    private readonly clock: InstituteClockService,
  ) {}

  /** Audit entries of a local period (inclusive), newest first. */
  async getActivity(from: string, to: string, take: number) {
    const timeZone = await this.clock.getTimezone();
    return this.auditLogRepository.findBetween(
      localMidnightUtc(from, timeZone),
      localMidnightUtc(shiftLocalDate(to, 1), timeZone),
      take,
    );
  }

  /** Names of users by id (deleted ones included: history keeps them). */
  async getUserNames(ids: number[]): Promise<Map<number, string>> {
    return this.staffRepository.findNames(ids);
  }
}
