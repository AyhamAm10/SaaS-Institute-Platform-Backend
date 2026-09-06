import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { RequestContextModule } from './context/request-context.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InstitutesModule } from './modules/institutes/institutes.module';
import { BranchesModule } from './modules/branches/branches.module';
import { AcademicYearsModule } from './modules/academic-years/academic-years.module';
import { SectionsModule } from './modules/sections/sections.module';

@Module({
  imports: [
    // Global config — loads .env automatically
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Infrastructure
    PrismaModule,
    RequestContextModule,

    // Domain modules
    AuthModule,
    UsersModule,
    InstitutesModule,
    BranchesModule,
    AcademicYearsModule,
    SectionsModule,
  ],
})
export class AppModule {}

