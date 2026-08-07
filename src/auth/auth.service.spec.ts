import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailProvider } from '../mail/mail.provider';
import {
  accessTokenAudience,
  isRefreshTokenPayload,
  jwtIssuer,
  refreshTokenAudience,
} from './auth-token';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    clearRefreshTokenHash: jest.MockedFunction<
      (userId: string) => Promise<void>
    >;
    findByEmail: jest.MockedFunction<(email: string) => Promise<unknown>>;
    findByEmailWithPasswordReset: jest.MockedFunction<
      (email: string) => Promise<unknown>
    >;
    findByIdWithRefreshToken: jest.MockedFunction<
      (userId: string) => Promise<unknown>
    >;
    updateRefreshTokenHash: jest.MockedFunction<
      (userId: string, refreshTokenHash: string) => Promise<void>
    >;
    updatePasswordResetToken: jest.MockedFunction<
      (userId: string, tokenHash: string, expiresAt: Date) => Promise<void>
    >;
    updatePasswordWithResetToken: jest.MockedFunction<
      (
        userId: string,
        password: string,
        passwordResetTokenHash: string,
      ) => Promise<boolean>
    >;
  };
  let jwtService: {
    signAsync: jest.MockedFunction<
      (payload: unknown, options?: unknown) => Promise<string>
    >;
    verifyAsync: jest.MockedFunction<
      (token: string, options?: unknown) => Promise<unknown>
    >;
  };
  let config: Record<string, string>;
  let configService: {
    get: jest.MockedFunction<(key: string) => string | undefined>;
    getOrThrow: jest.MockedFunction<(key: string) => string>;
  };
  let mailProvider: {
    sendPasswordResetEmail: jest.MockedFunction<
      MailProvider['sendPasswordResetEmail']
    >;
  };

  beforeEach(async () => {
    usersService = {
      clearRefreshTokenHash: jest.fn<Promise<void>, [userId: string]>(),
      findByEmail: jest.fn<Promise<unknown>, [email: string]>(),
      findByEmailWithPasswordReset: jest.fn<
        Promise<unknown>,
        [email: string]
      >(),
      findByIdWithRefreshToken: jest.fn<Promise<unknown>, [userId: string]>(),
      updateRefreshTokenHash: jest.fn<
        Promise<void>,
        [userId: string, refreshTokenHash: string]
      >(),
      updatePasswordResetToken: jest.fn<
        Promise<void>,
        [userId: string, tokenHash: string, expiresAt: Date]
      >(),
      updatePasswordWithResetToken: jest.fn<
        Promise<boolean>,
        [userId: string, password: string, passwordResetTokenHash: string]
      >(),
    };
    jwtService = {
      signAsync: jest.fn<
        Promise<string>,
        [payload: unknown, options?: unknown]
      >(),
      verifyAsync: jest.fn<
        Promise<unknown>,
        [token: string, options?: unknown]
      >(),
    };
    config = {
      CLIENT_ORIGIN: 'https://app.example.com',
      NODE_ENV: 'test',
    };
    configService = {
      get: jest.fn((key: string) => config[key]),
      getOrThrow: jest.fn((key: string) => {
        const value = config[key];

        if (!value) throw new Error(`${key} is required`);

        return value;
      }),
    };
    mailProvider = {
      sendPasswordResetEmail: jest.fn<Promise<void>, [email: unknown]>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: MailProvider,
          useValue: mailProvider,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('logs in a valid user and stores the rotated refresh token hash', async () => {
    usersService.findByEmail.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'test@example.com',
      isSuspended: false,
      password: await bcrypt.hash('Password1', 4),
      role: 'user',
    });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await expect(
      service.login('test@example.com', 'Password1', true),
    ).resolves.toEqual({
      accessToken: 'access-token',
      accessTokenMaxAgeMs: 900_000,
      refreshToken: 'refresh-token',
      refreshTokenMaxAgeMs: 2_592_000_000,
      userId: 'user-1',
    });

    expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      {
        email: 'test@example.com',
        role: 'user',
        sub: 'user-1',
        tokenType: 'access',
      },
      {
        audience: accessTokenAudience,
        expiresIn: '900s',
        issuer: jwtIssuer,
      },
    );
    const [refreshTokenPayload, refreshTokenOptions] =
      jwtService.signAsync.mock.calls[1];
    expect(isRefreshTokenPayload(refreshTokenPayload)).toBe(true);
    expect(refreshTokenOptions).toEqual({
      audience: refreshTokenAudience,
      expiresIn: '2592000s',
      issuer: jwtIssuer,
    });

    const refreshTokenHash =
      usersService.updateRefreshTokenHash.mock.calls[0][1];
    await expect(
      bcrypt.compare('refresh-token', refreshTokenHash),
    ).resolves.toBe(true);
  });

  it('rejects login when the password is invalid', async () => {
    usersService.findByEmail.mockResolvedValue({
      email: 'test@example.com',
      isSuspended: false,
      password: await bcrypt.hash('Password1', 4),
      role: 'user',
    });

    await expect(
      service.login('test@example.com', 'WrongPassword1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(usersService.updateRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('refreshes a valid session and rotates the stored refresh token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      rememberMe: false,
      sub: 'user-1',
      tokenId: 'refresh-token-id',
      tokenType: 'refresh',
    });
    usersService.findByIdWithRefreshToken.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'current@example.com',
      isSuspended: false,
      refreshTokenHash: await bcrypt.hash('old-refresh-token', 4),
      role: 'moderator',
    });
    jwtService.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');

    await expect(service.refresh('old-refresh-token')).resolves.toEqual({
      accessToken: 'new-access-token',
      accessTokenMaxAgeMs: 900_000,
      refreshToken: 'new-refresh-token',
      refreshTokenMaxAgeMs: 604_800_000,
      userId: 'user-1',
    });

    expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
    );
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('old-refresh-token', {
      audience: refreshTokenAudience,
      issuer: jwtIssuer,
    });
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      {
        email: 'current@example.com',
        role: 'moderator',
        sub: 'user-1',
        tokenType: 'access',
      },
      expect.objectContaining({ audience: accessTokenAudience }),
    );
  });

  it('rejects an access token at the refresh boundary', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      email: 'test@example.com',
      role: 'user',
      sub: 'user-1',
      tokenType: 'access',
    });

    await expect(service.refresh('access-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(usersService.findByIdWithRefreshToken).not.toHaveBeenCalled();
    expect(usersService.updateRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('rejects refresh when the submitted token does not match the stored hash', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      rememberMe: false,
      sub: 'user-1',
      tokenId: 'refresh-token-id',
      tokenType: 'refresh',
    });
    usersService.findByIdWithRefreshToken.mockResolvedValue({
      isSuspended: false,
      refreshTokenHash: await bcrypt.hash('different-refresh-token', 4),
    });

    await expect(service.refresh('old-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(usersService.updateRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('clears the stored refresh token hash on logout', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      rememberMe: false,
      sub: 'user-1',
      tokenId: 'refresh-token-id',
      tokenType: 'refresh',
    });

    await service.logout('refresh-token');

    expect(usersService.clearRefreshTokenHash).toHaveBeenCalledWith('user-1');
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('refresh-token', {
      audience: refreshTokenAudience,
      issuer: jwtIssuer,
    });
  });

  it('does not clear a session when logout receives an access token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      email: 'test@example.com',
      role: 'user',
      sub: 'user-1',
      tokenType: 'access',
    });

    await service.logout('access-token');

    expect(usersService.clearRefreshTokenHash).not.toHaveBeenCalled();
  });

  it.each(['development', 'test'])(
    'emails a 30-minute reset link and exposes the token in %s mode',
    async (nodeEnvironment) => {
      config.NODE_ENV = nodeEnvironment;
      usersService.findByEmail.mockResolvedValue({
        _id: { toString: () => 'user-1' },
        email: 'test+reset@example.com',
      });
      const beforeRequest = Date.now();

      const response = await service.requestPasswordReset(
        'test+reset@example.com',
      );

      expect(response.message).toBe(
        'If an account exists for that email, a reset link has been sent.',
      );
      expect(typeof response.resetToken).toBe('string');
      expect(mailProvider.sendPasswordResetEmail).toHaveBeenCalledTimes(1);

      const email = mailProvider.sendPasswordResetEmail.mock.calls[0][0];
      const resetUrl = new URL(email.resetUrl);
      expect(email).toEqual(
        expect.objectContaining({
          expiresInMinutes: 30,
          to: 'test+reset@example.com',
        }),
      );
      expect(resetUrl.origin).toBe('https://app.example.com');
      expect(resetUrl.pathname).toBe('/forgot-password');
      expect(resetUrl.searchParams.get('email')).toBe('test+reset@example.com');
      expect(resetUrl.searchParams.get('token')).toBe(response.resetToken);

      const [userId, resetTokenHash, expiresAt] =
        usersService.updatePasswordResetToken.mock.calls[0];
      expect(userId).toBe('user-1');
      await expect(
        bcrypt.compare(response.resetToken!, resetTokenHash),
      ).resolves.toBe(true);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
        beforeRequest + 30 * 60 * 1000,
      );
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 30 * 60 * 1000,
      );
    },
  );

  it.each(['production', 'staging'])(
    'does not expose the reset token in %s mode',
    async (nodeEnvironment) => {
      config.NODE_ENV = nodeEnvironment;
      usersService.findByEmail.mockResolvedValue({
        _id: { toString: () => 'user-1' },
        email: 'test@example.com',
      });

      await expect(
        service.requestPasswordReset('test@example.com'),
      ).resolves.toEqual({
        message:
          'If an account exists for that email, a reset link has been sent.',
      });

      expect(mailProvider.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    },
  );

  it('does not report success when reset email delivery fails', async () => {
    config.NODE_ENV = 'production';
    usersService.findByEmail.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'test@example.com',
    });
    mailProvider.sendPasswordResetEmail.mockRejectedValue(
      new Error('SMTP delivery failed'),
    );

    await expect(
      service.requestPasswordReset('test@example.com'),
    ).rejects.toThrow('SMTP delivery failed');
  });

  it('keeps the generic response and skips delivery for an unknown email', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.requestPasswordReset('missing@example.com'),
    ).resolves.toEqual({
      message:
        'If an account exists for that email, a reset link has been sent.',
    });

    expect(usersService.updatePasswordResetToken).not.toHaveBeenCalled();
    expect(mailProvider.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('clears reset fields through a one-time conditional password update', async () => {
    const resetToken = 'a'.repeat(32);
    const passwordResetTokenHash = await bcrypt.hash(resetToken, 4);

    usersService.findByEmailWithPasswordReset.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
      passwordResetTokenHash,
    });
    usersService.updatePasswordWithResetToken.mockResolvedValue(true);

    await expect(
      service.resetPassword('test@example.com', resetToken, 'Password1'),
    ).resolves.toEqual({ message: 'Password reset successfully.' });

    expect(usersService.updatePasswordWithResetToken).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      passwordResetTokenHash,
    );

    const hashedPassword =
      usersService.updatePasswordWithResetToken.mock.calls[0][1];
    await expect(bcrypt.compare('Password1', hashedPassword)).resolves.toBe(
      true,
    );
  });

  it('rejects a reset token that was already consumed', async () => {
    const resetToken = 'b'.repeat(32);
    const passwordResetTokenHash = await bcrypt.hash(resetToken, 4);

    usersService.findByEmailWithPasswordReset.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
      passwordResetTokenHash,
    });
    usersService.updatePasswordWithResetToken.mockResolvedValue(false);

    await expect(
      service.resetPassword('test@example.com', resetToken, 'Password1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not update the password when the reset token is invalid', async () => {
    usersService.findByEmailWithPasswordReset.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
      passwordResetTokenHash: await bcrypt.hash('valid-token'.repeat(4), 4),
    });

    await expect(
      service.resetPassword('test@example.com', 'c'.repeat(32), 'Password1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(usersService.updatePasswordWithResetToken).not.toHaveBeenCalled();
  });
});
