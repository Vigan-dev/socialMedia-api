import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
  type RateLimitRule,
} from './rate-limit.decorator';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RequestWithIp = Request & {
  body?: unknown;
  ip?: string;
};

type RateLimitCheck = {
  bucket?: RateLimitBucket;
  key: string;
  retryAfterSeconds: number;
  rule: RateLimitRule;
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
    const checks = this.getRateLimitChecks(options, request, now);
    const blockedCheck = checks.find(
      ({ bucket, rule }) =>
        Boolean(bucket) && bucket!.resetAt > now && bucket!.count >= rule.limit,
    );

    if (blockedCheck) {
      this.rejectRequest(context, blockedCheck.retryAfterSeconds);
    }

    checks.forEach(({ bucket, key, rule }) => {
      if (!bucket || bucket.resetAt <= now) {
        this.buckets.set(key, {
          count: 1,
          resetAt: now + rule.ttlMs,
        });
        return;
      }

      bucket.count += 1;
    });
    return true;
  }

  private getRateLimitChecks(
    options: RateLimitOptions,
    request: RequestWithIp,
    now: number,
  ): RateLimitCheck[] {
    const rules = [
      this.toRateLimitRule(options),
      ...(options.secondaryLimits ?? []),
    ];

    return rules.map((rule) => {
      const key = this.getRateLimitKey(rule, request);
      const bucket = this.buckets.get(key);

      return {
        bucket,
        key,
        retryAfterSeconds: bucket
          ? Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
          : Math.ceil(rule.ttlMs / 1000),
        rule,
      };
    });
  }

  private toRateLimitRule(options: RateLimitOptions): RateLimitRule {
    return {
      bodyField: options.bodyField,
      keyPrefix: options.keyPrefix,
      limit: options.limit,
      ttlMs: options.ttlMs,
    };
  }

  private getRateLimitKey(rule: RateLimitRule, request: RequestWithIp) {
    const parts = [rule.keyPrefix, this.getClientIp(request)];

    if (rule.bodyField) {
      parts.push(this.getBodyFieldValue(request, rule.bodyField));
    }

    return parts.join(':');
  }

  private getBodyFieldValue(request: RequestWithIp, field: string) {
    const body = request.body;

    if (!body || typeof body !== 'object') {
      return 'missing';
    }

    const value = (body as Record<string, unknown>)[field];
    if (typeof value !== 'string') {
      return 'missing';
    }

    return this.normalizeKeyPart(value);
  }

  private normalizeKeyPart(value: string) {
    const normalizedValue = value.trim().toLowerCase().replace(/:/g, '%3a');

    return normalizedValue.slice(0, 254) || 'missing';
  }

  private rejectRequest(context: ExecutionContext, retryAfterSeconds: number) {
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
