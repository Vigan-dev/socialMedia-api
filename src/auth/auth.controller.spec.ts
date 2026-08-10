import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    changePassword: jest.Mock;
    getSessionUser: jest.Mock;
    getSecurityActivity: jest.Mock;
    login: jest.Mock;
    logout: jest.Mock;
    refresh: jest.Mock;
    register: jest.Mock;
    requestPasswordReset: jest.Mock;
    resetPassword: jest.Mock;
    revokeAllSessions: jest.Mock;
  };
  let response: {
    clearCookie: jest.Mock;
    cookie: jest.Mock;
  };
  let request: Request;

  const session = {
    accessToken: 'access-token',
    accessTokenMaxAgeMs: 900_000,
    refreshToken: 'refresh-token',
    refreshTokenMaxAgeMs: 604_800_000,
    userId: 'user-1',
  };

  beforeEach(async () => {
    authService = {
      changePassword: jest.fn(),
      getSessionUser: jest.fn(),
      getSecurityActivity: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      refresh: jest.fn(),
      register: jest.fn(),
      requestPasswordReset: jest.fn(),
      resetPassword: jest.fn(),
      revokeAllSessions: jest.fn(),
    };
    response = {
      clearCookie: jest.fn(),
      cookie: jest.fn(),
    };
    request = {
      headers: { 'user-agent': 'jest' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sets access and refresh cookies on login', async () => {
    authService.login.mockResolvedValue(session);

    await expect(
      controller.login(
        { email: 'test@example.com', password: 'Password1', rememberMe: false },
        request,
        response as Response,
      ),
    ).resolves.toEqual({ ok: true });

    expect(authService.login).toHaveBeenCalledWith(
      'test@example.com',
      'Password1',
      false,
      { ip: '127.0.0.1', userAgent: 'jest' },
      undefined,
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'access_token',
      session.accessToken,
      expect.objectContaining({
        httpOnly: true,
        maxAge: session.accessTokenMaxAgeMs,
        sameSite: 'lax',
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      session.refreshToken,
      expect.objectContaining({
        httpOnly: true,
        maxAge: session.refreshTokenMaxAgeMs,
        sameSite: 'lax',
      }),
    );
  });

  it('returns a two-factor challenge without setting session cookies', async () => {
    authService.login.mockResolvedValue({ requiresTwoFactor: true });

    await expect(
      controller.login(
        { email: 'test@example.com', password: 'Password1' },
        request,
        response as Response,
      ),
    ).resolves.toEqual({ requiresTwoFactor: true });

    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('logs failed login attempts without setting cookies', async () => {
    const error = new UnauthorizedException('Invalid email or password');
    authService.login.mockRejectedValue(error);

    await expect(
      controller.login(
        { email: 'test@example.com', password: 'WrongPassword1' },
        request,
        response as Response,
      ),
    ).rejects.toBe(error);

    expect(console.warn).toHaveBeenCalledWith(
      '[auth] Failed login attempt',
      expect.objectContaining({
        email: 'te***@example.com',
        ip: '127.0.0.1',
        userAgent: 'jest',
      }),
    );
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('refreshes a session from the refresh cookie and returns the user', async () => {
    const user = { id: 'user-1', username: 'Tester' };
    authService.refresh.mockResolvedValue(session);
    authService.getSessionUser.mockResolvedValue(user);

    await expect(
      controller.refresh(
        { cookies: { refresh_token: session.refreshToken } } as Request,
        response as Response,
      ),
    ).resolves.toEqual({ user });

    expect(authService.refresh).toHaveBeenCalledWith(session.refreshToken);
    expect(authService.getSessionUser).toHaveBeenCalledWith(session.userId);
    expect(response.cookie).toHaveBeenCalledTimes(2);
  });

  it('rejects refresh when no refresh cookie is present', async () => {
    await expect(
      controller.refresh({ cookies: {} } as Request, response as Response),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('logs out the server session and clears auth cookies', async () => {
    await expect(
      controller.logout(
        { cookies: { refresh_token: session.refreshToken } } as Request,
        response as Response,
      ),
    ).resolves.toEqual({ ok: true });

    expect(authService.logout).toHaveBeenCalledWith(session.refreshToken);
    expect(response.clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
  });

  it('clears cookies on logout even when no refresh cookie is present', async () => {
    await expect(
      controller.logout({ cookies: {} } as Request, response as Response),
    ).resolves.toEqual({ ok: true });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(response.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('changes the password and clears the current browser cookies', async () => {
    authService.changePassword.mockResolvedValue({ message: 'changed' });
    const authenticatedRequest = {
      ...request,
      user: { id: 'user-1' },
    } as unknown as Request;

    await expect(
      controller.changePassword(
        {
          currentPassword: 'Password1',
          newPassword: 'NewPassword2',
        },
        authenticatedRequest,
        response as Response,
      ),
    ).resolves.toEqual({ message: 'changed' });

    expect(authService.changePassword).toHaveBeenCalledWith(
      'user-1',
      'Password1',
      'NewPassword2',
      { ip: '127.0.0.1', userAgent: 'jest' },
    );
    expect(response.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('revokes every session and clears the current browser cookies', async () => {
    authService.revokeAllSessions.mockResolvedValue({ message: 'revoked' });
    const authenticatedRequest = {
      ...request,
      user: { id: 'user-1' },
    } as unknown as Request;

    await expect(
      controller.logoutAll(authenticatedRequest, response as Response),
    ).resolves.toEqual({ message: 'revoked' });

    expect(authService.revokeAllSessions).toHaveBeenCalledWith('user-1', {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
    expect(response.clearCookie).toHaveBeenCalledTimes(2);
  });
});
