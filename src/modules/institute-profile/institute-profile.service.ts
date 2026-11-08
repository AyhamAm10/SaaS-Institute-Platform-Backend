import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { CacheKeys } from '../../infrastructure/cache/cache-keys';
import {
  InstituteProfileData,
  InstituteProfileRepository,
} from './institute-profile.repository';
import { UpdateInstituteProfileDto } from './dto/update-institute-profile.dto';

@Injectable()
export class InstituteProfileService {
  constructor(
    @Inject(InstituteProfileRepository)
    private readonly repository: InstituteProfileRepository,
    @Inject(CacheService)
    private readonly cache: CacheService,
  ) {}

  async getProfile(): Promise<InstituteProfileData> {
    const instituteId = RequestContext.getInstituteId();
    const profile = await this.repository.findProfile(instituteId);
    Ensure.exists(profile, 'Institute');
    return profile;
  }

  async updateProfile(
    dto: UpdateInstituteProfileDto,
  ): Promise<InstituteProfileData> {
    const instituteId = RequestContext.getInstituteId();

    if (dto.name !== undefined) Ensure.required(dto.name, 'name');
    if (dto.phone !== undefined) Ensure.required(dto.phone, 'phone');
    if (dto.address !== undefined) Ensure.required(dto.address, 'address');

    if (dto.timezone !== undefined) {
      Ensure.required(dto.timezone, 'timezone');
      try {
        Intl.DateTimeFormat(undefined, { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException(ErrorMessages.get('invalid_timezone'));
      }
    }

    const data: {
      name?: string;
      phone?: string;
      address?: string;
      timezone?: string;
    } = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;

    if (Object.keys(data).length > 0) {
      await this.repository.updateProfile(instituteId, data);
      if (dto.timezone !== undefined) {
        await this.cache.del(CacheKeys.instituteTimezone, []);
      }
    }

    return this.getProfile();
  }
}

