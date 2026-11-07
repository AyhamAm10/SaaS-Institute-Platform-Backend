import { Inject, Injectable } from '@nestjs/common';
import { Bus } from '@prisma/client';
import { RequestContext } from '../../../context/request-context';
import { Ensure } from '../../../common/errors/ensure';
import { BranchRepository } from '../../branches/branch.repository';
import { LookupService } from '../lookup/lookup.service';
import { BusRepository } from './bus.repository';
import { CreateBusDto, UpdateBusDto } from './dto/bus.dto';

@Injectable()
export class BusesService extends LookupService<
  Bus,
  CreateBusDto,
  UpdateBusDto
> {
  constructor(
    @Inject(BusRepository) private readonly busRepository: BusRepository,
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
  ) {
    super(busRepository, 'resource_bus');
  }

  /** Branch resolution (role.md §9.3): DTO → active branch → default branch. */
  override async create(dto: CreateBusDto): Promise<Bus> {
    let branchId = dto.branchId ?? RequestContext.getBranchId();
    if (branchId) {
      Ensure.exists(await this.branchRepository.findById(branchId), 'Branch');
    } else {
      branchId = (await this.branchRepository.getOrCreateDefaultBranch()).id;
    }
    return super.create({ ...dto, branchId });
  }

  protected override toData(
    dto: CreateBusDto | UpdateBusDto,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if ('branchId' in dto && dto.branchId !== undefined)
      data['branchId'] = dto.branchId;
    if (dto.plateNumber !== undefined)
      data['plateNumber'] = dto.plateNumber.trim() || null;
    if (dto.driverName !== undefined)
      data['driverName'] = dto.driverName.trim() || null;
    if (dto.driverPhone !== undefined)
      data['driverPhone'] = dto.driverPhone.trim() || null;
    if (dto.capacity !== undefined) data['capacity'] = dto.capacity;
    if (dto.isActive !== undefined) data['isActive'] = dto.isActive;
    return data;
  }

  /** Bus names are unique per branch. */
  protected override findDuplicate(
    name: string,
    dto: CreateBusDto | UpdateBusDto,
    existing?: Bus,
  ): Promise<Bus | null> {
    const branchId =
      existing?.branchId ?? ('branchId' in dto ? dto.branchId : undefined);
    return branchId
      ? this.busRepository.findByNameInBranch(name, branchId)
      : this.busRepository.findByName(name);
  }
}
