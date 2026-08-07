import type { Request } from 'express';

export type RequestMetadata = {
  ip: string;
  userAgent: string;
};

export function getRequestMetadata(request: Request): RequestMetadata {
  return {
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
  };
}

export function getClientIp(request: Pick<Request, 'ip' | 'socket'>): string {
  return (
    request.ip?.trim().slice(0, 64) ||
    request.socket.remoteAddress?.trim().slice(0, 64) ||
    'unknown'
  );
}

function getUserAgent(request: Pick<Request, 'headers'>) {
  const value = request.headers['user-agent'];
  return (typeof value === 'string' ? value : 'unknown').trim().slice(0, 512);
}
