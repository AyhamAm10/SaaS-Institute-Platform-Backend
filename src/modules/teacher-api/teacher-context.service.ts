import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';

/**
 * Operational context of teacher requests. A teacher can work in several
 * branches, so read models run in a NEUTRAL branch (the teacher scope is what
 * limits them) with an explicit year, and per-section reads run in that
 * section's own branch and year. The institute always stays the one in the
 * verified JWT. Applied with a nested `RequestContext.run`: the request's own
 * store is untouched.
 */
@Injectable()
export class TeacherContextService {
  /** Runs `fn` with no branch and the given year (null = no year filter). */
  runForYear<T>(academicYearId: number | null, fn: () => Promise<T>): Promise<T> {
    return RequestContext.run(
      {
        ...RequestContext.getOrFail(),
        branchId: undefined,
        academicYearId: academicYearId ?? undefined,
      },
      fn,
    );
  }

  /** Runs `fn` inside a section's own branch and year. */
  runForSection<T>(
    section: { branchId: number; academicYearId: number },
    fn: () => Promise<T>,
  ): Promise<T> {
    return RequestContext.run(
      {
        ...RequestContext.getOrFail(),
        branchId: section.branchId,
        academicYearId: section.academicYearId,
      },
      fn,
    );
  }
}
