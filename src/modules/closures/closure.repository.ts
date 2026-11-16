import { Inject, Injectable } from '@nestjs/common';
import { Closure } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../../common/time/timezone';

/** A closure with its branch and sections, as the service maps it. */
export type ClosureWithRefs = Closure & {
  branch: { id: number; name: string } | null;
  sections: { section: { id: number; name: string } }[];
};

const INCLUDE = {
  branch: { select: { id: true, name: true } },
  sections: { select: { section: { select: { id: true, name: true } } } },
} as const;

/**
 * Closures (holidays). Institute-wide data, NOT scoped by the branch header:
 * the settings tab lists every closure of the institute (institute, branch and
 * section ones), so the model is listed in `CONTEXT_EXEMPT` of the coverage test.
 */
@Injectable()
export class ClosureRepository extends TenantAwareRepository<Closure> {
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'closure');
  }

  /** Closures that overlap [from, to] (inclusive local dates); no bounds = all. */
  async findOverlapping(
    from?: string,
    to?: string,
  ): Promise<ClosureWithRefs[]> {
    return this.client.closure.findMany({
      where: this.scopeWhere({
        ...(from && { toDate: { gte: dateOnly(from) } }),
        ...(to && { fromDate: { lte: dateOnly(to) } }),
      }),
      include: INCLUDE,
      orderBy: [{ fromDate: 'desc' }, { id: 'desc' }],
      take: 500,
    }) as Promise<ClosureWithRefs[]>;
  }

  async findWithRefs(id: number): Promise<ClosureWithRefs | null> {
    return this.client.closure.findFirst({
      where: this.scopeWhere({ id }),
      include: INCLUDE,
    }) as Promise<ClosureWithRefs | null>;
  }

  /** Replaces the sections of a closure (call inside a transaction). */
  async replaceSections(
    closureId: number,
    sectionIds: number[],
  ): Promise<void> {
    const instituteId = this.getInstituteId();
    await this.client.closureSection.deleteMany({
      where: { closureId, instituteId },
    });
    if (sectionIds.length === 0) return;
    await this.client.closureSection.createMany({
      data: sectionIds.map((sectionId) => ({
        closureId,
        sectionId,
        instituteId,
      })),
    });
  }
}
