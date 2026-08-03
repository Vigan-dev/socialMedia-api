import { BadRequestException } from '@nestjs/common';

export type CursorPage<T> = {
  hasMore: boolean;
  items: T[];
  nextCursor: string | null;
};

export type CursorBoundary = {
  id: string;
  sortValue: string;
};

type EncodedCursor = CursorBoundary & {
  scope: string;
  version: 1;
};

export function parsePageLimit(
  value: string | undefined,
  defaultLimit = 20,
  maxLimit = 50,
) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}

export function encodeCursor(scope: string, boundary: CursorBoundary): string {
  const payload: EncodedCursor = {
    ...boundary,
    scope,
    version: 1,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(
  scope: string,
  cursor?: string,
): CursorBoundary | null {
  if (!cursor) {
    return null;
  }

  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    decoded = null;
  }

  if (!decoded || typeof decoded !== 'object') {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const value = decoded as Partial<EncodedCursor>;

  if (
    value.version !== 1 ||
    value.scope !== scope ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.sortValue !== 'string' ||
    !value.sortValue
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  return { id: value.id, sortValue: value.sortValue };
}

export function buildCursorPage<T>(
  values: T[],
  limit: number,
  getCursor: (value: T) => string,
): CursorPage<T> {
  const hasMore = values.length > limit;
  const items = values.slice(0, limit);
  const lastItem = hasMore ? items.at(-1) : undefined;

  return {
    hasMore,
    items,
    nextCursor: lastItem ? getCursor(lastItem) : null,
  };
}
