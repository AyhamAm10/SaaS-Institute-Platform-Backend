import { Inject, Injectable } from '@nestjs/common';
import { FeatureKey, InstituteFeature } from '@prisma/client';
import { InstituteFeatureRepository } from './institute-feature.repository';
import { InstituteFeatureSystemRepository } from './institute-feature-system.repository';
import { InstitutesService } from '../institutes/institutes.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { UpdateInstituteFeaturesDto } from './dto/update-institute-features.dto';
import { FeatureStatus } from './dto/feature-status.dto';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { SystemCacheService } from '../../infrastructure/cache/system-cache.service';
import { CacheKeys } from '../../infrastructure/cache/cache-keys';

@Injectable()
export class InstituteFeaturesService {
  constructor(
    @Inject(InstituteFeatureRepository)
    private readonly featureRepository: InstituteFeatureRepository,
    @Inject(InstituteFeatureSystemRepository)
    private readonly featureSystemRepository: InstituteFeatureSystemRepository,
    @Inject(InstitutesService)
    private readonly institutesService: InstitutesService,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
    @Inject(CacheService)
    private readonly cache: CacheService,
    @Inject(SystemCacheService)
    private readonly systemCache: SystemCacheService,
  ) {}

  /** Features of the caller's institute (cached — checked by FeatureGuard on every request). */
  async getCurrent(): Promise<FeatureStatus[]> {
    return this.cache.getOrSet(CacheKeys.instituteFeatures, [], async () =>
      this.toStatusList(await this.featureRepository.findMany()),
    );
  }

  async isEnabled(key: FeatureKey): Promise<boolean> {
    const features = await this.getCurrent();
    return features.some((f) => f.key === key && f.enabled);
  }

  /** Features of any institute (super admin). */
  async getForInstitute(instituteId: number): Promise<FeatureStatus[]> {
    await this.institutesService.findById(instituteId);
    return this.toStatusList(
      await this.featureSystemRepository.findByInstitute(instituteId),
    );
  }

  /** Switch features on/off for an institute (super admin). */
  async setForInstitute(
    instituteId: number,
    dto: UpdateInstituteFeaturesDto,
  ): Promise<FeatureStatus[]> {
    await this.institutesService.findById(instituteId);
    await this.transactionHelper.executeInTransaction(async () => {
      for (const { key, enabled } of dto.features) {
        await this.featureSystemRepository.upsert(instituteId, key, enabled);
      }
    });
    await this.systemCache.delForInstitute(
      instituteId,
      CacheKeys.instituteFeatures,
      [],
    );
    return this.getForInstitute(instituteId);
  }

  private toStatusList(rows: InstituteFeature[]): FeatureStatus[] {
    return Object.values(FeatureKey).map((key) => ({
      key,
      enabled: rows.some((r) => r.key === key && r.enabled),
    }));
  }
}
