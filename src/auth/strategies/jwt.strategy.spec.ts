import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy(
      new ConfigService({ JWT_SECRET: 'a'.repeat(32) }),
    );
  });

  it('accepts a valid access-token payload', () => {
    expect(
      strategy.validate({
        email: 'test@example.com',
        role: 'user',
        sub: 'user-1',
        tokenType: 'access',
      }),
    ).toEqual({
      email: 'test@example.com',
      id: 'user-1',
      role: 'user',
    });
  });

  it('rejects a refresh-token payload on protected routes', () => {
    expect(() =>
      strategy.validate({
        rememberMe: true,
        sub: 'user-1',
        tokenId: 'refresh-token-id',
        tokenType: 'refresh',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects an access token with an unknown role', () => {
    expect(() =>
      strategy.validate({
        email: 'test@example.com',
        role: 'owner',
        sub: 'user-1',
        tokenType: 'access',
      }),
    ).toThrow(UnauthorizedException);
  });
});
