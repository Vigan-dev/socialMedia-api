import { BadRequestException } from '@nestjs/common';

import {
  buildCursorPage,
  decodeCursor,
  encodeCursor,
  parsePageLimit,
} from './cursor-pagination';

describe('cursor pagination', () => {
  it('round-trips scoped opaque cursors', () => {
    const cursor = encodeCursor('messages', {
      id: 'record-id',
      sortValue: '2026-08-03T12:00:00.000Z',
    });

    expect(decodeCursor('messages', cursor)).toEqual({
      id: 'record-id',
      sortValue: '2026-08-03T12:00:00.000Z',
    });
  });

  it('rejects malformed and cross-endpoint cursors', () => {
    const cursor = encodeCursor('messages', {
      id: 'record-id',
      sortValue: 'sort-value',
    });

    expect(() => decodeCursor('users', cursor)).toThrow(BadRequestException);
    expect(() => decodeCursor('messages', 'invalid')).toThrow(
      BadRequestException,
    );
  });

  it('bounds limits and creates a page from limit plus one results', () => {
    expect(parsePageLimit('500', 20, 50)).toBe(50);
    expect(parsePageLimit('invalid', 20, 50)).toBe(20);
    expect(buildCursorPage([1, 2, 3], 2, (value) => `cursor-${value}`)).toEqual(
      {
        hasMore: true,
        items: [1, 2],
        nextCursor: 'cursor-2',
      },
    );
  });
});
