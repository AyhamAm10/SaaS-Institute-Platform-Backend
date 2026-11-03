import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import {
  DEFAULT_INSTITUTE_TIMEZONE,
  getLocalParts,
  LocalDateTimeParts,
} from '../../common/time/timezone';
import { InstituteRepository } from './institute.repository';

/**
 * InstituteClock
 *
 * The single source of "today" and "now" for the caller's institute
 * (role.md §5.10). Domain services MUST use it instead of `new Date()` when a
 * calendar date matters (attendance day, installment due/overdue, exams).
 */
@Injectable()
export class InstituteClockService {
  constructor(
    @Inject(InstituteRepository)
    private readonly instituteRepository: InstituteRepository,
  ) {}

  /** IANA time zone of the current institute. */
  async getTimezone(): Promise<string> {
    const institute = await this.instituteRepository.findById(
      RequestContext.getInstituteId(),
    );
    return institute?.timezone ?? DEFAULT_INSTITUTE_TIMEZONE;
  }

  /** Local date / time-of-day / weekday of `at` (default: now) for the institute. */
  async localParts(at: Date = new Date()): Promise<LocalDateTimeParts> {
    return getLocalParts(at, await this.getTimezone());
  }

  /** Today's local date in the institute, `YYYY-MM-DD`. */
  async today(): Promise<string> {
    return (await this.localParts()).date;
  }
}
