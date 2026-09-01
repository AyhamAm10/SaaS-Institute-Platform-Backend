import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './database/redis.module';
import { RequestContextModule } from './context/request-context.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    // Global config — loads .env automatically
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Infrastructure
    PrismaModule,
    RedisModule,
    RequestContextModule,

    // Domain modules
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
