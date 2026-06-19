import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const unsafeMethods = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

export function createSameOriginWriteMiddleware(allowedOrigins: string[]) {
  const allowedOriginSet = new Set(allowedOrigins);

  return (request: Request, _response: Response, next: NextFunction) => {
    if (!unsafeMethods.has(request.method.toUpperCase())) {
      next();
      return;
    }

    const origin = getHeaderValue(request, 'origin');
    if (origin) {
      assertAllowedOrigin(origin, allowedOriginSet, getRequestOrigin(request));
      next();
      return;
    }

    const refererOrigin = getRefererOrigin(request);
    if (refererOrigin) {
      assertAllowedOrigin(
        refererOrigin,
        allowedOriginSet,
        getRequestOrigin(request),
      );
      next();
      return;
    }

    throw new ForbiddenException('Missing Origin or Referer header');
  };
}

function assertAllowedOrigin(
  origin: string,
  allowedOrigins: Set<string>,
  requestOrigin?: string,
) {
  if (!allowedOrigins.has(origin) && origin !== requestOrigin) {
    throw new ForbiddenException('Cross-origin write requests are not allowed');
  }
}

function getRefererOrigin(request: Request) {
  const referer = getHeaderValue(request, 'referer');
  if (!referer) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    throw new ForbiddenException('Invalid Referer header');
  }
}

function getRequestOrigin(request: Request) {
  const host =
    getFirstHeaderPart(request, 'x-forwarded-host') ??
    getFirstHeaderPart(request, 'host');
  if (!host) {
    return undefined;
  }

  const protocol =
    getFirstHeaderPart(request, 'x-forwarded-proto') ?? request.protocol;

  return `${protocol}://${host}`;
}

function getFirstHeaderPart(request: Request, name: string) {
  return getHeaderValue(request, name)?.split(',')[0]?.trim();
}

function getHeaderValue(request: Request, name: string) {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
