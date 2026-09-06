import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  AuthCookiesService,
  REFRESH_TOKEN_COOKIE,
} from './auth-cookies.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClientTypeHeader } from '../../common/decorators/client-type.decorator';
import { ClientType } from '../../common/types/client-type.enum';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Authentication controller — handles authentication with dual client delivery strategies:
 *
 * Requirements:
 * - Every client sends X-Client-Type: web | mobile
 * - Web: Return/store Access Token and Refresh Token using secure HttpOnly cookies.
 * - Mobile: Return Access Token and Refresh Token in the JSON response.
 * - Same endpoints for both: POST /auth/login, POST /auth/refresh, POST /auth/logout.
 */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AuthCookiesService)
    private readonly authCookiesService: AuthCookiesService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @ClientTypeHeader() clientType: ClientType,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    if (clientType === ClientType.WEB) {
      this.authCookiesService.setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      return { user: result.user };
    }

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @ClientTypeHeader() clientType: ClientType,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.id);

    if (clientType === ClientType.WEB) {
      this.authCookiesService.clearAuthCookies(res);
    }

    return { message: 'Logged out successfully' };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @ClientTypeHeader() clientType: ClientType,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (clientType === ClientType.MOBILE) {
      if (!dto.refreshToken) {
        throw new BadRequestException(
          'refreshToken is required in request body for mobile clients',
        );
      }
      return this.authService.refresh({ refreshToken: dto.refreshToken });
    }

    // Web client: extract refresh token from cookie or body
    const token =
      dto.refreshToken ??
      this.authCookiesService.extractCookie(req, REFRESH_TOKEN_COOKIE);

    if (!token) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const tokens = await this.authService.refresh({ refreshToken: token });
    this.authCookiesService.setAuthCookies(res, tokens);
    return { message: 'Tokens refreshed successfully' };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }
}

