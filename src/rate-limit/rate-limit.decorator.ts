import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate-limit';

export type RateLimitRule = {
  bodyField?: string;
  keyPrefix: string;
  limit: number;
  ttlMs: number;
};

export type RateLimitOptions = RateLimitRule & {
  secondaryLimits?: RateLimitRule[];
};

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
