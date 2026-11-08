import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CacheModule } from '../../infrastructure/cache/cache.module';
import { InstituteProfileController } from './institute-profile.controller';
import { InstituteProfileService } from './institute-profile.service';
import { InstituteProfileRepository } from './institute-profile.repository';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [InstituteProfileController],
  providers: [InstituteProfileService, InstituteProfileRepository],
  exports: [InstituteProfileService, InstituteProfileRepository],
})
export class InstituteProfileModule {}
