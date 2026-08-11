export const UNIFIED_SEARCH_TEXT_MIN_LENGTH = 2;
export const UNIFIED_SEARCH_TEXT_MAX_LENGTH = 80;

export function normalizeUnifiedSearchText(value: string) {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}
