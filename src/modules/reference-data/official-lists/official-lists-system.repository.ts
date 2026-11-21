import { Inject, Injectable } from '@nestjs/common';
import { Nationality } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { SystemRepository } from '../../../database/system.repository';

/** The entries every new institute starts with (editable afterwards in Settings). */
export const DEFAULT_OFFICIAL_LISTS = {
  nationalities: ['عربي سوري'],
  religions: ['مسلم', 'مسيحي'],
  languages: ['الإنكليزية', 'الفرنسية'],
  enrollmentSituations: ['مستجد', 'ناجح ويعيد', 'راسب', 'طالب مركز', 'مفصول'],
} as const;

/**
 * Cross-tenant access to the official lists (nationalities, religions, languages,
 * enrollment situations) — used ONLY to provision a newly created institute.
 */
@Injectable()
export class OfficialListsSystemRepository extends SystemRepository<Nationality> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'nationality');
  }

  async createDefaults(instituteId: number): Promise<void> {
    const rows = (names: readonly string[]) => names.map((name) => ({ instituteId, name }));
    await this.client.nationality.createMany({ data: rows(DEFAULT_OFFICIAL_LISTS.nationalities), skipDuplicates: true });
    await this.client.religion.createMany({ data: rows(DEFAULT_OFFICIAL_LISTS.religions), skipDuplicates: true });
    await this.client.language.createMany({ data: rows(DEFAULT_OFFICIAL_LISTS.languages), skipDuplicates: true });
    await this.client.enrollmentSituation.createMany({ data: rows(DEFAULT_OFFICIAL_LISTS.enrollmentSituations), skipDuplicates: true });
  }
}
