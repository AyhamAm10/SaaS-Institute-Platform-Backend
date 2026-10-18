import { Inject, Injectable } from '@nestjs/common';
import { Prisma, StudentField } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class StudentFieldRepository extends TenantAwareRepository<StudentField> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'studentField');
  }

  async findAllForTenant(includeInactive = false): Promise<StudentField[]> {
    const instituteId = this.getInstituteId();
    const where: Prisma.StudentFieldWhereInput = { instituteId };

    if (!includeInactive) {
      where.isActive = true;
    }

    return (this.client as any).studentField.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findByName(name: string): Promise<StudentField | null> {
    const instituteId = this.getInstituteId();
    return (this.client as any).studentField.findFirst({
      where: { instituteId, name },
    });
  }

  async findFieldById(id: number): Promise<StudentField | null> {
    const instituteId = this.getInstituteId();
    return (this.client as any).studentField.findFirst({
      where: { id, instituteId },
    });
  }
}
