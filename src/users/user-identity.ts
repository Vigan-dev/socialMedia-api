export type DuplicateIdentityField = 'email' | 'identity' | 'username';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username: string): string {
  return username.trim();
}

export function normalizeUsernameLower(username: string): string {
  return normalizeUsername(username).toLowerCase();
}

export function getDuplicateIdentityField(
  error: unknown,
): DuplicateIdentityField | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 11000
  ) {
    return null;
  }

  const duplicateError = error as {
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    message?: string;
  };
  const keys = new Set([
    ...Object.keys(duplicateError.keyPattern ?? {}),
    ...Object.keys(duplicateError.keyValue ?? {}),
  ]);
  const message = duplicateError.message?.toLowerCase() ?? '';

  if (
    keys.has('emailLower') ||
    keys.has('email') ||
    message.includes('emaillower') ||
    message.includes('email_1')
  ) {
    return 'email';
  }

  if (
    keys.has('usernameLower') ||
    keys.has('username') ||
    message.includes('usernamelower') ||
    message.includes('username_1')
  ) {
    return 'username';
  }
  return 'identity';
}
