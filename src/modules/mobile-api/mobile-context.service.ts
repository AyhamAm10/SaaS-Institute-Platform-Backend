import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { MobileStudentRow } from '../students/student.repository';

/** Operational scope established for one child. */
export interface ChildScope {
  child: MobileStudentRow;
  branchId: number;
  /** Year of the active enrollment, else the institute's current year, else null. */
  academicYearId: number | null;
  /** The ACTIVE enrollment of that year, if any. */
  enrollment: { id: number; sectionId: number; section: { id: number; name: string } } | null;
}

/**
 * Operational context of mobile requests. Mobile apps send no
 * `X-Branch-Id` / `X-Academic-Year-Id`, and one family can have children in
 * different branches / years, so the context is derived per child from the
 * child's own record and never from the client:
 *   branch = student.branchId
 *   year   = active enrollment year, else the institute's current year, else null
 * It is applied with a NESTED `RequestContext.run` (the request's own store is
 * untouched, so nothing leaks between children). The institute always stays
 * the one in the verified JWT.
 */
@Injectable()
export class MobileContextService {
  constructor(
    @Inject(AcademicYearsService)
    private readonly years: AcademicYearsService,
  ) {}

  /** Runs `fn` with no branch / year (ignores headers a client may send anyway). */
  runNeutral<T>(fn: () => T): T {
    return RequestContext.run(
      { ...RequestContext.getOrFail(), branchId: undefined, academicYearId: undefined },
      fn,
    );
  }

  /** Scope of a child: branch and year as described above. */
  async scopeOf(child: MobileStudentRow): Promise<ChildScope> {
    const enrollment = child.studentEnrollments[0] ?? null;
    const academicYearId = enrollment
      ? enrollment.academicYearId
      : await this.neutral(() => this.years.findCurrentYearId());
    return {
      child,
      branchId: child.branchId,
      academicYearId,
      enrollment: enrollment
        ? { id: enrollment.id, sectionId: enrollment.sectionId, section: enrollment.section }
        : null,
    };
  }

  /** Runs `fn` inside the child's branch / year context. */
  async runFor<T>(child: MobileStudentRow, fn: (scope: ChildScope) => Promise<T>): Promise<T> {
    const scope = await this.scopeOf(child);
    return RequestContext.run(
      {
        ...RequestContext.getOrFail(),
        branchId: scope.branchId,
        academicYearId: scope.academicYearId ?? undefined,
      },
      () => fn(scope),
    );
  }

  private neutral<T>(fn: () => Promise<T>): Promise<T> {
    return this.runNeutral(fn);
  }
}
