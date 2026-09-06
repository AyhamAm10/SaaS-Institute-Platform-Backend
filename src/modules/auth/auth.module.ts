import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt-token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UsersModule } from '../users/users.module';

import { AuthCookiesService } from './auth-cookies.service';

@Module({
  imports: [
    // Register JwtModule with empty defaults — per-call options are used
    // in JwtTokenService for separate access/refresh secrets.
    JwtModule.register({}),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtTokenService,
    AuthCookiesService,
    RolesGuard,
    // Global guard — all routes require auth unless marked @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global RBAC guard — enforces @Roles() decorators
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [JwtTokenService, RolesGuard, AuthCookiesService],
})
export class AuthModule {}
