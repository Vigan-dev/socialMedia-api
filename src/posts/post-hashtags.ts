const hashtagPattern = /#([\p{L}\p{N}_][\p{L}\p{N}_-]{0,49})/gu;

export const MAX_POST_HASHTAGS = 10;

export function normalizeHashtag(value: string) {
  return value
    .trim()
    .replace(/^#+/, '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US');
}

export function isValidHashtag(value: string) {
  return /^[\p{L}\p{N}_][\p{L}\p{N}_-]{0,49}$/u.test(value);
}

export function extractHashtags(content: string) {
  const hashtags = new Set<string>();

  for (const match of content.matchAll(hashtagPattern)) {
    const hashtag = normalizeHashtag(match[1]);

    if (hashtag) {
      hashtags.add(hashtag);
    }

    if (hashtags.size === MAX_POST_HASHTAGS) {
      break;
    }
  }

  return [...hashtags];
}
