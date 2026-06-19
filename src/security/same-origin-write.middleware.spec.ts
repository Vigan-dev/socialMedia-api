import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createSameOriginWriteMiddleware } from './same-origin-write.middleware';

function createRequest(input: {
  headers?: Request['headers'];
  method: string;
  protocol?: string;
}) {
  return {
    headers: input.headers ?? {},
    method: input.method,
    protocol: input.protocol ?? 'http',
  } as Request;
}

describe('createSameOriginWriteMiddleware', () => {
  const middleware = createSameOriginWriteMiddleware([
    'http://localhost:3001',
    'https://app.example.com',
  ]);

  it('allows safe methods without origin headers', () => {
    const next = jest.fn();

    middleware(
      createRequest({ method: 'GET' }),
      {} as Response,
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows unsafe methods from configured origins', () => {
    const next = jest.fn();

    middleware(
      createRequest({
        headers: { origin: 'https://app.example.com' },
        method: 'POST',
      }),
      {} as Response,
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows unsafe methods from a same-origin referer', () => {
    const next = jest.fn();

    middleware(
      createRequest({
        headers: { referer: 'http://localhost:3001/settings' },
        method: 'PATCH',
      }),
      {} as Response,
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe methods from untrusted origins', () => {
    expect(() =>
      middleware(
        createRequest({
          headers: { origin: 'https://evil.example.com' },
          method: 'POST',
        }),
        {} as Response,
        jest.fn() as NextFunction,
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects unsafe methods without origin or referer headers', () => {
    expect(() =>
      middleware(
        createRequest({ method: 'DELETE' }),
        {} as Response,
        jest.fn() as NextFunction,
      ),
    ).toThrow(ForbiddenException);
  });
});
