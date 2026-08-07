import type { Request } from 'express';
import { getRequestMetadata } from './request-metadata';

describe('request metadata', () => {
  it('uses Express trusted-proxy resolution instead of spoofable raw headers', () => {
    const request = {
      headers: {
        'user-agent': 'A'.repeat(600),
        'x-forwarded-for': '203.0.113.50',
      },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;

    expect(getRequestMetadata(request)).toEqual({
      ip: '127.0.0.1',
      userAgent: 'A'.repeat(512),
    });
  });
});
