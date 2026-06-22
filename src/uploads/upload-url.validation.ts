export type UploadDirectory = 'avatars' | 'post-media';

const uploadFileNamePattern = '[a-z0-9][a-z0-9._-]*\\.(gif|jpe?g|png|webp)';

export const avatarUploadUrlPattern = new RegExp(
  `^(\\/uploads\\/avatars\\/${uploadFileNamePattern}|https?:\\/\\/[^\\s/?#]+\\/uploads\\/avatars\\/${uploadFileNamePattern})$`,
  'i',
);

export const postMediaUploadUrlPattern = new RegExp(
  `^(\\/uploads\\/post-media\\/${uploadFileNamePattern}|https?:\\/\\/[^\\s/?#]+\\/uploads\\/post-media\\/${uploadFileNamePattern})$`,
  'i',
);

export function isTrustedUploadUrl(input: {
  directory: UploadDirectory;
  publicApiUrl?: string;
  url: string;
}) {
  const expectedPathPattern = new RegExp(
    `^\\/uploads\\/${input.directory}\\/${uploadFileNamePattern}$`,
    'i',
  );

  if (input.url.startsWith('/')) {
    return expectedPathPattern.test(input.url);
  }

  if (!input.publicApiUrl) {
    return false;
  }

  let submittedUrl: URL;
  let publicUrl: URL;

  try {
    submittedUrl = new URL(input.url);
    publicUrl = new URL(input.publicApiUrl);
  } catch {
    return false;
  }

  return (
    ['http:', 'https:'].includes(submittedUrl.protocol) &&
    submittedUrl.origin === publicUrl.origin &&
    !submittedUrl.search &&
    !submittedUrl.hash &&
    expectedPathPattern.test(submittedUrl.pathname)
  );
}
