import { Inject, Injectable } from '@nestjs/common';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { CitiesService } from '../reference-data/cities/cities.service';
import { SchoolsService } from '../reference-data/schools/schools.service';
import { BusesService } from '../reference-data/buses/buses.service';
import { KnowWaysService } from '../reference-data/know-ways/know-ways.service';
import { StudentStatusesService } from '../reference-data/student-statuses/student-statuses.service';
import { StudentReferencesDto } from './dto/student-references.dto';

/**
 * Validates a student's reference-data links through the owning services
 * (role.md §10) and turns them into persistence fields.
 */
@Injectable()
export class StudentReferencesResolver {
  constructor(
    @Inject(CitiesService) private readonly citiesService: CitiesService,
    @Inject(SchoolsService) private readonly schoolsService: SchoolsService,
    @Inject(BusesService) private readonly busesService: BusesService,
    @Inject(KnowWaysService) private readonly knowWaysService: KnowWaysService,
    @Inject(StudentStatusesService)
    private readonly statusesService: StudentStatusesService,
  ) {}

  /**
   * @param branchId         the student's (final) branch
   * @param currentBusId     the bus already linked (update), re-checked if the branch changes
   * @param currentCityId    the student's existing city (update)
   * @param currentSchoolId  the student's existing school (update)
   * @param currentStudentId the student id (update), excluded from bus capacity count
   * @param isCreate         applies the default status when none is given
   */
  async resolve(
    dto: StudentReferencesDto,
    branchId: number,
    {
      currentBusId = null,
      currentCityId = null,
      currentSchoolId = null,
      currentStudentId = null,
      isCreate = false,
    }: {
      currentBusId?: number | null;
      currentCityId?: number | null;
      currentSchoolId?: number | null;
      currentStudentId?: number | null;
      isCreate?: boolean;
    } = {},
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    const effectiveCityId =
      dto.cityId !== undefined ? dto.cityId : currentCityId;

    if (dto.cityId !== undefined) {
      if (dto.cityId) await this.citiesService.getById(dto.cityId);
      data['cityId'] = dto.cityId;
    }

    if (dto.schoolId !== undefined) {
      if (dto.schoolId) {
        const school = await this.schoolsService.getById(dto.schoolId);
        if (
          school.cityId &&
          effectiveCityId &&
          school.cityId !== effectiveCityId
        ) {
          Ensure.custom(true, ErrorMessages.get('school_city_mismatch'), 400);
        }
      }
      data['schoolId'] = dto.schoolId;
    } else if (dto.cityId !== undefined && currentSchoolId) {
      const school = await this.schoolsService.getById(currentSchoolId);
      if (
        school.cityId &&
        effectiveCityId &&
        school.cityId !== effectiveCityId
      ) {
        Ensure.custom(true, ErrorMessages.get('school_city_mismatch'), 400);
      }
    }

    if (dto.knowWayId !== undefined) {
      if (dto.knowWayId) await this.knowWaysService.getById(dto.knowWayId);
      data['knowWayId'] = dto.knowWayId;
    }

    const busId = dto.busId !== undefined ? dto.busId : currentBusId;
    if (busId) {
      const bus = await this.busesService.getById(busId);
      Ensure.custom(
        bus.branchId !== branchId,
        ErrorMessages.get('bus_branch_mismatch'),
        400,
      );
    }
    if (dto.busId !== undefined) {
      if (dto.busId && dto.busId !== currentBusId) {
        await this.busesService.assertHasCapacity(dto.busId, currentStudentId);
      }
      data['busId'] = dto.busId;
    }

    if (dto.statusId) {
      await this.statusesService.getById(dto.statusId);
      data['statusId'] = dto.statusId;
    } else if (isCreate) {
      data['statusId'] = (await this.statusesService.getDefault())?.id ?? null;
    }

    return data;
  }
}
