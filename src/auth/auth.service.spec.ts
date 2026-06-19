import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    clearRefreshTokenHash: jest.Mock;
    findByEmail: jest.Mock;
    findByEmailWithPasswordReset: jest.Mock;
    findByIdWithRefreshToken: jest.Mock;
    updateRefreshTokenHash: jest.Mock;
    updatePasswordWithResetToken: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      clearRefreshTokenHash: jest.fn(),
      findByEmail: jest.fn(),
      findByEmailWithPasswordReset: jest.fn(),
      findByIdWithRefreshToken: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      updatePasswordWithResetToken: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
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

    const refreshTokenHash = usersService.updateRefreshTokenHash.mock
      .calls[0][1] as string;
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
      email: 'test@example.com',
      rememberMe: false,
      role: 'user',
      sub: 'user-1',
    });
    usersService.findByIdWithRefreshToken.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'test@example.com',
      isSuspended: false,
      refreshTokenHash: await bcrypt.hash('old-refresh-token', 4),
      role: 'user',
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
  });

  it('rejects refresh when the submitted token does not match the stored hash', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      email: 'test@example.com',
      role: 'user',
      sub: 'user-1',
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
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });

    await service.logout('refresh-token');

    expect(usersService.clearRefreshTokenHash).toHaveBeenCalledWith('user-1');
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

    const hashedPassword = usersService.updatePasswordWithResetToken.mock
      .calls[0][1] as string;
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
