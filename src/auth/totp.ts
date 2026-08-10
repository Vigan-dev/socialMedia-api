import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const totpDigits = 6;
const totpPeriodSeconds = 30;

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function createTotpUri(input: {
  account: string;
  issuer: string;
  secret: string;
}) {
  const label = `${input.issuer}:${input.account}`;
  const params = new URLSearchParams({
    algorithm: 'SHA1',
    digits: String(totpDigits),
    issuer: input.issuer,
    period: String(totpPeriodSeconds),
    secret: input.secret,
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function generateTotpCode(secret: string, now = Date.now()) {
  const counter = BigInt(Math.floor(now / 1000 / totpPeriodSeconds));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** totpDigits).padStart(totpDigits, '0');
}

export function verifyTotpCode(
  secret: string,
  requestedCode: string,
  now = Date.now(),
) {
  const code = requestedCode.trim();
  if (!/^\d{6}$/.test(code)) return false;

  return [-1, 0, 1].some((windowOffset) => {
    const expected = generateTotpCode(
      secret,
      now + windowOffset * totpPeriodSeconds * 1000,
    );

    return timingSafeEqual(Buffer.from(code), Buffer.from(expected));
  });
}

export function encryptTotpSecret(secret: string, encryptionKey: string) {
  const iv = randomBytes(12);
  const key = createHash('sha256').update(encryptionKey).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext]
    .map((value) => value.toString('base64url'))
    .join('.');
}

export function decryptTotpSecret(value: string, encryptionKey: string) {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted TOTP secret');

  const [ivValue, authTagValue, ciphertextValue] = parts;
  const key = createHash('sha256').update(encryptionKey).digest();
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function encodeBase32(value: Buffer) {
  let bits = 0;
  let buffer = 0;
  let encoded = '';

  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      encoded += base32Alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    encoded += base32Alphabet[(buffer << (5 - bits)) & 31];
  }

  return encoded;
}

function decodeBase32(value: string) {
  let bits = 0;
  let buffer = 0;
  const decoded: number[] = [];

  for (const character of value.toUpperCase().replace(/=+$/g, '')) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret');

    buffer = (buffer << 5) | index;
    bits += 5;

    if (bits >= 8) {
      decoded.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(decoded);
}
