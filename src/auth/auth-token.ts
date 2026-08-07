import { isUserRole, type UserRole } from './roles';

export const jwtIssuer = 'socialmedia-api';
export const accessTokenAudience = 'socialmedia-access';
export const refreshTokenAudience = 'socialmedia-refresh';

export type AccessTokenPayload = {
  email: string;
  role: UserRole;
  sub: string;
  tokenType: 'access';
};

export type RefreshTokenPayload = {
  rememberMe: boolean;
  sub: string;
  tokenId: string;
  tokenType: 'refresh';
};

export function isAccessTokenPayload(
  payload: unknown,
): payload is AccessTokenPayload {
  if (!isRecord(payload)) return false;

  return (
    payload.tokenType === 'access' &&
    typeof payload.sub === 'string' &&
    typeof payload.email === 'string' &&
    isUserRole(payload.role)
  );
}

export function isRefreshTokenPayload(
  payload: unknown,
): payload is RefreshTokenPayload {
  if (!isRecord(payload)) return false;

  return (
    payload.tokenType === 'refresh' &&
    typeof payload.sub === 'string' &&
    typeof payload.rememberMe === 'boolean' &&
    typeof payload.tokenId === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
