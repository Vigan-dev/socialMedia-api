import {
  avatarUploadUrlPattern,
  isTrustedUploadUrl,
  postMediaUploadUrlPattern,
} from './upload-url.validation';

describe('upload URL validation', () => {
  const publicApiUrl = 'https://api.example.com';

  it('accepts relative upload paths for the expected directory', () => {
    expect(
      isTrustedUploadUrl({
        directory: 'avatars',
        url: '/uploads/avatars/avatar.png',
      }),
    ).toBe(true);
    expect(
      isTrustedUploadUrl({
        directory: 'post-media',
        url: '/uploads/post-media/photo.webp',
      }),
    ).toBe(true);
  });

  it('accepts absolute upload URLs from the configured public API origin', () => {
    expect(
      isTrustedUploadUrl({
        directory: 'post-media',
        publicApiUrl,
        url: 'https://api.example.com/uploads/post-media/photo.jpg',
      }),
    ).toBe(true);
  });

  it('rejects external upload URLs even when their path looks valid', () => {
    expect(
      isTrustedUploadUrl({
        directory: 'avatars',
        publicApiUrl,
        url: 'https://cdn.example.com/uploads/avatars/avatar.png',
      }),
    ).toBe(false);
  });

  it('rejects paths outside the expected upload directory', () => {
    expect(
      isTrustedUploadUrl({
        directory: 'avatars',
        publicApiUrl,
        url: 'https://api.example.com/uploads/post-media/photo.png',
      }),
    ).toBe(false);
  });

  it('rejects query strings and fragments', () => {
    expect(
      isTrustedUploadUrl({
        directory: 'post-media',
        publicApiUrl,
        url: 'https://api.example.com/uploads/post-media/photo.png?track=1',
      }),
    ).toBe(false);
    expect(
      isTrustedUploadUrl({
        directory: 'post-media',
        publicApiUrl,
        url: 'https://api.example.com/uploads/post-media/photo.png#section',
      }),
    ).toBe(false);
  });

  it('keeps DTO shape checks scoped to uploaded media paths', () => {
    expect(avatarUploadUrlPattern.test('/uploads/avatars/avatar.png')).toBe(
      true,
    );
    expect(
      postMediaUploadUrlPattern.test('/uploads/post-media/photo.png'),
    ).toBe(true);
    expect(avatarUploadUrlPattern.test('https://example.com/avatar.png')).toBe(
      false,
    );
    expect(postMediaUploadUrlPattern.test('data:image/png;base64,abc')).toBe(
      false,
    );
  });
});
