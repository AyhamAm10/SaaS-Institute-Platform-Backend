import { Inject, Injectable } from '@nestjs/common';
import { ReceiptSequence } from '@prisma/client';
import { TenantAwareRepository } from '../../../database/tenant-aware.repository';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Receipt numbers per (branch, academic year). Kept in the DB, in the same
 * transaction as the payment (role.md §14.2 rule 7) — never in Redis.
 */
@Injectable()
export class ReceiptSequenceRepository extends TenantAwareRepository<ReceiptSequence> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'receiptSequence');
  }

  /**
   * Next receipt number. MUST run inside a transaction: the increment takes a
   * row lock until commit, so concurrent payments get consecutive numbers and
   * a rolled-back payment releases its number.
   */
  async next(branchId: number, academicYearId: number): Promise<number> {
    const instituteId = this.getInstituteId();
    await this.client.receiptSequence.createMany({
      data: [{ instituteId, branchId, academicYearId, lastNumber: 0 }],
      skipDuplicates: true,
    });
    const row = await this.client.receiptSequence.update({
      where: {
        instituteId_branchId_academicYearId: {
          instituteId,
          branchId,
          academicYearId,
        },
      },
      data: { lastNumber: { increment: 1 } },
    });
    return row.lastNumber as number;
  }
}
