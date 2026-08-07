import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import {
  accessTokenAudience,
  isAccessTokenPayload,
  jwtIssuer,
} from '../auth-token';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      audience: accessTokenAudience,
      issuer: jwtIssuer,
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => extractCookie(request, 'access_token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: unknown) {
    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException('Invalid access token');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}

function extractCookie(
  request: Request | undefined,
  name: string,
): string | null {
  const cookies: unknown = request?.cookies;
  if (cookies && typeof cookies === 'object') {
    const value = (cookies as Record<string, unknown>)[name];
    if (typeof value === 'string') {
      return value;
    }
  }

  const cookieHeader = request?.headers.cookie;
  if (!cookieHeader) return null;

  return (
    cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.split('=')
      .slice(1)
      .join('=') ?? null
  );
}
