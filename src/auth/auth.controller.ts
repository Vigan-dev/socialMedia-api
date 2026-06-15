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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.username, body.email, body.password);
  }

  @Post('login')
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
    const refreshToken = request.cookies?.refresh_token;
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
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Post('reset-password')
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
    const refreshToken = request.cookies?.refresh_token;
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
}
