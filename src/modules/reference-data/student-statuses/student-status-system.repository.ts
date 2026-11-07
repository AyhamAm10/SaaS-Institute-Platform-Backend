import { Inject, Injectable } from '@nestjs/common';
import { StudentStatus, StatusTone } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { SystemRepository } from '../../../database/system.repository';

/** Statuses every new institute starts with (editable afterwards). */
export const DEFAULT_STUDENT_STATUSES: ReadonlyArray<{
  name: string;
  tone: StatusTone;
  isDefault: boolean;
  sortOrder: number;
}> = [
  { name: 'مستمر', tone: StatusTone.SUCCESS, isDefault: true, sortOrder: 1 },
  { name: 'مؤجل', tone: StatusTone.WARNING, isDefault: false, sortOrder: 2 },
  { name: 'منقطع', tone: StatusTone.DANGER, isDefault: false, sortOrder: 3 },
];

/**
 * Cross-tenant access to student statuses — used ONLY to provision the
 * defaults of a newly created institute (super-admin operation).
 */
@Injectable()
export class StudentStatusSystemRepository extends SystemRepository<StudentStatus> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'studentStatus');
  }

  async createDefaults(instituteId: number): Promise<void> {
    await this.client.studentStatus.createMany({
      data: DEFAULT_STUDENT_STATUSES.map((s) => ({ ...s, instituteId })),
      skipDuplicates: true,
    });
  }
}
