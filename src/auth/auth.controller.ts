import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @RateLimit({ keyPrefix: 'auth:register', limit: 3, ttlMs: 10 * 60_000 })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.username, body.email, body.password);
  }

  @Post('login')
  @RateLimit({ keyPrefix: 'auth:login', limit: 5, ttlMs: 60_000 })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(
      body.email,
      body.password,
      body.rememberMe,
    );

    this.setSessionCookies(response, session);

    return { ok: true };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.getCookie(request, 'refresh_token');
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }

    const session = await this.authService.refresh(refreshToken);
    this.setSessionCookies(response, session);

    return {
      user: await this.authService.getSessionUser(session.userId),
    };
  }

  @Post('forgot-password')
  @RateLimit({
    keyPrefix: 'auth:forgot-password',
    limit: 3,
    ttlMs: 15 * 60_000,
  })
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Post('reset-password')
  @RateLimit({
    keyPrefix: 'auth:reset-password',
    limit: 5,
    ttlMs: 15 * 60_000,
  })
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(
      body.email,
      body.token,
      body.password,
    );
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.getCookie(request, 'refresh_token');
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    this.clearSessionCookies(response);

    return { ok: true };
  }

  private setSessionCookies(
    response: Response,
    session: {
      accessToken: string;
      accessTokenMaxAgeMs: number;
      refreshToken: string;
      refreshTokenMaxAgeMs: number;
    },
  ) {
    response.cookie('access_token', session.accessToken, {
      httpOnly: true,
      maxAge: session.accessTokenMaxAgeMs,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    response.cookie('refresh_token', session.refreshToken, {
      httpOnly: true,
      maxAge: session.refreshTokenMaxAgeMs,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  private clearSessionCookies(response: Response) {
    response.clearCookie('access_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    response.clearCookie('refresh_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  private getCookie(request: Request, name: string): string | undefined {
    const cookies: unknown = request.cookies;
    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }

    const value = (cookies as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
  }
}
