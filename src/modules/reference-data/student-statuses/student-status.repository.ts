import { Inject, Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PaginatedResult } from '../../../common/pagination/paginated-result';
import { LookupRepository } from '../lookup/lookup.repository';
import { LookupQueryDto } from '../lookup/dto/lookup-query.dto';

@Injectable()
export class StudentStatusRepository extends LookupRepository<StudentStatus> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'studentStatus');
  }

  /** Statuses are listed in their configured order. */
  override async findPaginated(
    query: LookupQueryDto,
  ): Promise<PaginatedResult<StudentStatus>> {
    return this.findManyPaginated(query, {
      where: this.searchWhere(query),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findDefault(): Promise<StudentStatus | null> {
    return this.findOne({ isDefault: true });
  }

  /** Clears the current default (call inside the transaction that sets a new one). */
  async unsetDefault(): Promise<void> {
    await this.client.studentStatus.updateMany({
      where: this.scopeWhere({ isDefault: true }),
      data: { isDefault: false },
    });
  }

  /** Students with this status. */
  async countUsage(id: number): Promise<number> {
    return this.client.student.count({
      where: {
        instituteId: this.getInstituteId(),
        statusId: id,
        deletedAt: null,
      },
    });
  }
}
