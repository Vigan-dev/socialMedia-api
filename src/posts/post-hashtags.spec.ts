import {
  extractHashtags,
  isValidHashtag,
  MAX_POST_HASHTAGS,
  normalizeHashtag,
} from './post-hashtags';

describe('post hashtags', () => {
  it('normalizes and deduplicates hashtags without losing unicode topics', () => {
    expect(
      extractHashtags('#TypeScript #typescript #NestJS #fejlesztés'),
    ).toEqual(['typescript', 'nestjs', 'fejlesztés']);
  });

  it('bounds the number of indexed hashtags per post', () => {
    const content = Array.from(
      { length: MAX_POST_HASHTAGS + 3 },
      (_, index) => `#topic${index}`,
    ).join(' ');

    expect(extractHashtags(content)).toHaveLength(MAX_POST_HASHTAGS);
  });

  it('accepts a hashtag with or without the hash prefix', () => {
    expect(normalizeHashtag('  ##NextJS  ')).toBe('nextjs');
    expect(isValidHashtag(normalizeHashtag('#NextJS'))).toBe(true);
    expect(isValidHashtag(normalizeHashtag('#not a topic'))).toBe(false);
  });
});
