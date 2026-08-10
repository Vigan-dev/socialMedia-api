import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { getRequestMetadata } from '../security/request-metadata';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendEmailVerificationDto } from './dto/resend-email-verification.dto';
import { TwoFactorSetupDto } from './dto/two-factor-setup.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';

type RequestWithUser = Request & {
  user?: {
    id: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @RateLimit({ keyPrefix: 'auth:register', limit: 3, ttlMs: 10 * 60_000 })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.username, body.email, body.password);
  }

  @Post('login')
  @RateLimit({
    bodyField: 'email',
    keyPrefix: 'auth:login:account',
    limit: 5,
    secondaryLimits: [{ keyPrefix: 'auth:login:ip', limit: 20, ttlMs: 60_000 }],
    ttlMs: 60_000,
  })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const metadata = getRequestMetadata(request);

    try {
      const session = await this.authService.login(
        body.email,
        body.password,
        body.rememberMe,
        metadata,
        body.twoFactorCode,
      );

      if ('requiresTwoFactor' in session) {
        return session;
      }

      this.logLoginAttempt(request, body.email, true);
      this.setSessionCookies(response, session);

      return { ok: true };
    } catch (error) {
      this.logLoginAttempt(request, body.email, false);
      throw error;
    }
  }

  @Post('verify-email')
  @RateLimit({ keyPrefix: 'auth:verify-email', limit: 10, ttlMs: 15 * 60_000 })
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.email, body.token);
  }

  @Post('resend-verification')
  @RateLimit({
    keyPrefix: 'auth:resend-verification',
    limit: 3,
    ttlMs: 15 * 60_000,
  })
  resendVerification(@Body() body: ResendEmailVerificationDto) {
    return this.authService.requestEmailVerification(body.email);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'auth:2fa-setup', limit: 5, ttlMs: 15 * 60_000 })
  setupTwoFactor(
    @Body() body: TwoFactorSetupDto,
    @Req() request: RequestWithUser,
  ) {
    return this.authService.setupTwoFactor(request.user!.id, body.password);
  }

  @Post('2fa/confirm')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'auth:2fa-confirm', limit: 10, ttlMs: 15 * 60_000 })
  confirmTwoFactor(
    @Body() body: TwoFactorCodeDto,
    @Req() request: RequestWithUser,
  ) {
    return this.authService.confirmTwoFactor(
      request.user!.id,
      body.code,
      getRequestMetadata(request),
    );
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'auth:2fa-disable', limit: 5, ttlMs: 15 * 60_000 })
  async disableTwoFactor(
    @Body() body: DisableTwoFactorDto,
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.disableTwoFactor(
      request.user!.id,
      body.password,
      body.code,
      getRequestMetadata(request),
    );
    this.clearSessionCookies(response);
    return result;
  }

  @Post('refresh')
  @RateLimit({ keyPrefix: 'auth:refresh', limit: 30, ttlMs: 60_000 })
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
  resetPassword(@Body() body: ResetPasswordDto, @Req() request: Request) {
    return this.authService.resetPassword(
      body.email,
      body.token,
      body.password,
      getRequestMetadata(request),
    );
  }

  @Get('security/activity')
  @UseGuards(JwtAuthGuard)
  getSecurityActivity(@Req() request: RequestWithUser) {
    return this.authService.getSecurityActivity(request.user!.id);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @RateLimit({
    keyPrefix: 'auth:change-password',
    limit: 5,
    ttlMs: 15 * 60_000,
  })
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.changePassword(
      request.user!.id,
      body.currentPassword,
      body.newPassword,
      getRequestMetadata(request),
    );
    this.clearSessionCookies(response);

    return result;
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'auth:logout-all', limit: 5, ttlMs: 60_000 })
  async logoutAll(
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.revokeAllSessions(
      request.user!.id,
      getRequestMetadata(request),
    );
    this.clearSessionCookies(response);

    return result;
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

  private logLoginAttempt(request: Request, email: string, success: boolean) {
    const metadata = {
      email: this.redactEmail(email),
      ip: this.getClientIp(request),
      userAgent: request.headers['user-agent'] ?? 'unknown',
    };

    if (success) {
      console.info('[auth] Successful login', metadata);
      return;
    }

    console.warn('[auth] Failed login attempt', metadata);
  }

  private getClientIp(request: Request) {
    return getRequestMetadata(request).ip;
  }

  private redactEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const [name = '', domain = 'unknown'] = normalizedEmail.split('@');
    const visiblePrefix = name.slice(0, 2);

    return `${visiblePrefix || '**'}***@${domain}`;
  }
}
