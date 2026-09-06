import { Inject, Injectable } from '@nestjs/common';
import { AcademicYear } from '@prisma/client';
import { AcademicYearRepository } from './academic-year.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { PaginatedResult } from '../../common/pagination/paginated-result';

/**
 * Service managing AcademicYear lifecycle and business rules.
 *
 * Business invariants enforced:
 * - Name uniqueness within the same institute
 * - startDate must be before endDate
 * - No overlapping date ranges within the same institute
 * - Setting current year is atomic (unsets previous, sets new)
 */
@Injectable()
export class AcademicYearsService {
  constructor(
    @Inject(AcademicYearRepository)
    private readonly academicYearRepository: AcademicYearRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  /**
   * Create a new academic year for the current institute.
   */
  async create(dto: CreateAcademicYearDto): Promise<AcademicYear> {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    // Validate date order
    Ensure.custom(
      startDate >= endDate,
      ErrorMessages.get('date_invalid'),
    );

    // Validate name uniqueness within tenant
    const existingByName = await this.academicYearRepository.findByName(dto.name);
    Ensure.alreadyExists(existingByName, 'Academic year name');

    // Validate no date overlap within tenant
    const overlapping = await this.academicYearRepository.findOverlapping(startDate, endDate);
    Ensure.custom(
      overlapping !== null,
      ErrorMessages.get('academic_year_overlap'),
      409,
    );

    // If isCurrent is requested, atomically unset previous and create new
    if (dto.isCurrent) {
      return this.transactionHelper.executeInTransaction(async () => {
        await this.academicYearRepository.lockInstituteForUpdate();
        await this.academicYearRepository.unsetCurrentYear();
        return this.academicYearRepository.create({
          name: dto.name,
          startDate,
          endDate,
          isCurrent: true,
        });
      });
    }

    return this.academicYearRepository.create({
      name: dto.name,
      startDate,
      endDate,
      isCurrent: false,
    });
  }

  /**
   * Update an existing academic year.
   */
  async update(id: number, dto: UpdateAcademicYearDto): Promise<AcademicYear> {
    // Verify existence and tenant ownership (TenantAwareRepository handles this)
    const existing = await this.academicYearRepository.findById(id);
    Ensure.exists(existing, 'Academic year');

    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;

    // Validate date order if dates changed
    if (dto.startDate || dto.endDate) {
      Ensure.custom(
        startDate >= endDate,
        ErrorMessages.get('date_invalid'),
      );
    }

    // Validate name uniqueness if name changed
    if (dto.name && dto.name !== existing.name) {
      const existingByName = await this.academicYearRepository.findByName(dto.name);
      Ensure.alreadyExists(existingByName, 'Academic year name');
    }

    // Validate no date overlap if dates changed
    if (dto.startDate || dto.endDate) {
      const overlapping = await this.academicYearRepository.findOverlapping(
        startDate,
        endDate,
        id,
      );
      Ensure.custom(
        overlapping !== null,
        ErrorMessages.get('academic_year_overlap'),
        409,
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData['name'] = dto.name;
    if (dto.startDate !== undefined) updateData['startDate'] = startDate;
    if (dto.endDate !== undefined) updateData['endDate'] = endDate;

    // If isCurrent is being set to true, do it atomically
    if (dto.isCurrent === true && !existing.isCurrent) {
      return this.transactionHelper.executeInTransaction(async () => {
        await this.academicYearRepository.lockInstituteForUpdate();
        await this.academicYearRepository.unsetCurrentYear();
        updateData['isCurrent'] = true;
        return this.academicYearRepository.update(id, updateData);
      });
    }

    if (dto.isCurrent !== undefined) {
      updateData['isCurrent'] = dto.isCurrent;
    }

    return this.academicYearRepository.update(id, updateData);
  }

  /**
   * Atomically set an academic year as the current year.
   * Unsets the previous current year in the same transaction with row-level institute locking.
   */
  async setCurrent(id: number): Promise<AcademicYear> {
    const existing = await this.academicYearRepository.findById(id);
    Ensure.exists(existing, 'Academic year');

    return this.transactionHelper.executeInTransaction(async () => {
      await this.academicYearRepository.lockInstituteForUpdate();
      await this.academicYearRepository.unsetCurrentYear();
      return this.academicYearRepository.update(id, { isCurrent: true });
    });
  }

  /**
   * Retrieve all academic years with pagination.
   */
  async findAll(
    pagination: PaginationQueryDto,
    search?: string,
  ): Promise<PaginatedResult<AcademicYear>> {
    return this.academicYearRepository.findAllPaginated(pagination, search);
  }

  /**
   * Retrieve an academic year by ID.
   */
  async findById(id: number): Promise<AcademicYear> {
    const year = await this.academicYearRepository.findById(id);
    Ensure.exists(year, 'Academic year');
    return year;
  }

  /**
   * Retrieve all sections belonging to a specific academic year.
   */
  async findSections(id: number): Promise<unknown[]> {
    const year = await this.academicYearRepository.findById(id);
    Ensure.exists(year, 'Academic year');
    return this.academicYearRepository.findSections(id);
  }
}

