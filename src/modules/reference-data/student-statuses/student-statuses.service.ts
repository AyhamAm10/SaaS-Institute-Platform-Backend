import { Inject, Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { Ensure } from '../../../common/errors/ensure';
import { ErrorMessages } from '../../../common/errors/error-messages';
import { TransactionHelper } from '../../../database/transaction.helper';
import { LookupService } from '../lookup/lookup.service';
import { StudentStatusRepository } from './student-status.repository';
import { StudentStatusSystemRepository } from './student-status-system.repository';
import {
  CreateStudentStatusDto,
  UpdateStudentStatusDto,
} from './dto/student-status.dto';

/**
 * Institute-defined student statuses. Exactly one default status exists:
 * setting a new default unsets the previous one (same transaction), and the
 * default can be neither deleted, deactivated nor un-defaulted directly.
 */
@Injectable()
export class StudentStatusesService extends LookupService<
  StudentStatus,
  CreateStudentStatusDto,
  UpdateStudentStatusDto
> {
  constructor(
    @Inject(StudentStatusRepository)
    private readonly statusRepository: StudentStatusRepository,
    @Inject(StudentStatusSystemRepository)
    private readonly statusSystemRepository: StudentStatusSystemRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {
    super(statusRepository, 'resource_student_status');
  }

  override async create(dto: CreateStudentStatusDto): Promise<StudentStatus> {
    this.assertDefaultNotLost(Boolean(dto.isDefault) && dto.isActive === false);
    return this.transactionHelper.executeInTransaction(async () => {
      if (dto.isDefault) await this.statusRepository.unsetDefault();
      return super.create(dto);
    });
  }

  override async update(
    id: number,
    dto: UpdateStudentStatusDto,
  ): Promise<StudentStatus> {
    const existing = await this.getById(id);
    this.assertDefaultNotLost(
      existing.isDefault && (dto.isDefault === false || dto.isActive === false),
    );

    return this.transactionHelper.executeInTransaction(async () => {
      if (dto.isDefault && !existing.isDefault)
        await this.statusRepository.unsetDefault();
      return super.update(id, dto);
    });
  }

  override async delete(id: number): Promise<void> {
    const existing = await this.getById(id);
    this.assertDefaultNotLost(existing.isDefault);
    await super.delete(id);
  }

  /** The status new students get when none is chosen. */
  async getDefault(): Promise<StudentStatus | null> {
    return this.statusRepository.findDefault();
  }

  /** Default statuses of a newly created institute (super-admin flow). */
  async provisionDefaults(instituteId: number): Promise<void> {
    await this.statusSystemRepository.createDefaults(instituteId);
  }

  protected override toData(
    dto: CreateStudentStatusDto | UpdateStudentStatusDto,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (dto.tone !== undefined) data['tone'] = dto.tone;
    if (dto.isDefault !== undefined) data['isDefault'] = dto.isDefault;
    if (dto.sortOrder !== undefined) data['sortOrder'] = dto.sortOrder;
    if (dto.isActive !== undefined) data['isActive'] = dto.isActive;
    return data;
  }

  /** The institute must always keep one active default status. */
  private assertDefaultNotLost(losing: boolean): void {
    Ensure.custom(
      losing,
      ErrorMessages.get('student_status_default_locked'),
      400,
    );
  }
}
