import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RequestWithIp = Request & {
  ip?: string;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private lastPrunedAt = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const now = Date.now();
    this.pruneExpiredBuckets(now);

    const request = context.switchToHttp().getRequest<RequestWithIp>();
    const key = `${options.keyPrefix}:${this.getClientIp(request)}`;
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + options.ttlMs,
      });
      return true;
    }

    if (bucket.count >= options.limit) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', retryAfterSeconds.toString());

      throw new HttpException(
        {
          message: 'Too many requests',
          retryAfterSeconds,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    return true;
  }

  private getClientIp(request: RequestWithIp) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const firstForwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0];

    return (
      firstForwardedIp?.trim() ||
      request.ip ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }

  private pruneExpiredBuckets(now: number) {
    if (now - this.lastPrunedAt < 60_000) {
      return;
    }

    this.lastPrunedAt = now;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
