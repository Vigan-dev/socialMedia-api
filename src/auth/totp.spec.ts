import {
  createTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpCode,
  verifyTotpCode,
} from './totp';

describe('TOTP utilities', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const now = Date.parse('2026-08-10T12:00:00.000Z');

  it('generates and verifies time-based one-time codes with clock tolerance', () => {
    const code = generateTotpCode(secret, now);

    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotpCode(secret, '000000', now)).toBe(false);
  });

  it('encrypts secrets at rest with authenticated encryption', () => {
    const encrypted = encryptTotpSecret(secret, 'a'.repeat(32));

    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, 'a'.repeat(32))).toBe(secret);
    expect(() => decryptTotpSecret(encrypted, 'b'.repeat(32))).toThrow();
  });

  it('builds an authenticator-compatible provisioning URI', () => {
    expect(
      createTotpUri({
        account: 'ada@example.com',
        issuer: 'Versatile',
        secret,
      }),
    ).toContain('otpauth://totp/Versatile%3Aada%40example.com?');
  });
});
