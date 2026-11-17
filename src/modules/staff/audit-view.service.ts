import { Inject, Injectable } from '@nestjs/common';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { localMidnightUtc, shiftLocalDate } from '../../common/time/timezone';
import { AuditLogRepository } from './audit-log.repository';
import { StaffRepository } from './staff.repository';
import { auditChanges, auditLabel } from './audit-view.rules';
import { AuditEntryView, AuditQueryDto } from './dto/audit-query.dto';

/**
 * Audit viewer: who changed or deleted what, and when (staff only). The log
 * is written by the audited repositories (updates and deletes; creations are
 * not logged). Values come from the snapshot, never password fields.
 */
@Injectable()
export class AuditViewService {
  constructor(
    @Inject(AuditLogRepository) private readonly logs: AuditLogRepository,
    @Inject(StaffRepository) private readonly staff: StaffRepository,
    @Inject(InstituteClockService) private readonly clock: InstituteClockService,
  ) {}

  async search(query: AuditQueryDto) {
    const timeZone = await this.clock.getTimezone();
    const gte = query.from ? localMidnightUtc(query.from, timeZone) : undefined;
    const lt = query.to ? localMidnightUtc(shiftLocalDate(query.to, 1), timeZone) : undefined;

    const { rows, total } = await this.logs.search({
      gte,
      lt,
      entity: query.entity,
      entityId: query.entityId,
      userId: query.userId,
      action: query.action,
      skip: query.skip,
      take: query.limit,
    });
    const names = await this.staff.findNames([
      ...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : []))),
    ]);

    const data: AuditEntryView[] = rows.map((r) => {
      const before = (r.before ?? null) as Record<string, unknown> | null;
      return {
        id: r.id,
        createdAt: r.createdAt,
        userId: r.userId,
        userName: r.userId ? (names.get(r.userId) ?? null) : null,
        entity: r.entity,
        entityId: r.entityId,
        action: r.action,
        label: auditLabel(before),
        changes: auditChanges(before, (r.changes ?? null) as Record<string, unknown> | null),
      };
    });
    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }
}
