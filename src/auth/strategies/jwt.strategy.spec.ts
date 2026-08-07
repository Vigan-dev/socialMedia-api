import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: { findByIdForAccess: jest.Mock };

  beforeEach(() => {
    usersService = {
      findByIdForAccess: jest.fn().mockResolvedValue({
        _id: { toString: () => 'user-1' },
        email: 'test@example.com',
        isSuspended: false,
        role: 'user',
        securityVersion: 2,
      }),
    };
    strategy = new JwtStrategy(
      new ConfigService({ JWT_SECRET: 'a'.repeat(32) }),
      usersService as never,
    );
  });

  it('accepts a valid access-token payload', async () => {
    await expect(
      strategy.validate({
        email: 'test@example.com',
        role: 'user',
        sessionVersion: 2,
        sub: 'user-1',
        tokenType: 'access',
      }),
    ).resolves.toEqual({
      email: 'test@example.com',
      id: 'user-1',
      role: 'user',
    });
  });

  it('rejects a refresh-token payload on protected routes', async () => {
    await expect(
      strategy.validate({
        rememberMe: true,
        sub: 'user-1',
        tokenId: 'refresh-token-id',
        tokenType: 'refresh',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an access token with an unknown role', async () => {
    await expect(
      strategy.validate({
        email: 'test@example.com',
        role: 'owner',
        sessionVersion: 2,
        sub: 'user-1',
        tokenType: 'access',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an access token after the session version changes', async () => {
    await expect(
      strategy.validate({
        email: 'test@example.com',
        role: 'user',
        sessionVersion: 1,
        sub: 'user-1',
        tokenType: 'access',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
