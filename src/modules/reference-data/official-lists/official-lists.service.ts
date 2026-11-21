import { Inject, Injectable } from '@nestjs/common';
import { OfficialListsSystemRepository } from './official-lists-system.repository';

/** Provisions the official lists (nationalities, religions, languages, situations) of a new institute. */
@Injectable()
export class OfficialListsService {
  constructor(
    @Inject(OfficialListsSystemRepository)
    private readonly systemRepository: OfficialListsSystemRepository,
  ) {}

  async provisionDefaults(instituteId: number): Promise<void> {
    await this.systemRepository.createDefaults(instituteId);
  }
}
