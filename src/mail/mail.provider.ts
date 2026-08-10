export type PasswordResetEmail = {
  expiresInMinutes: number;
  resetUrl: string;
  to: string;
};

export type EmailVerificationEmail = {
  expiresInHours: number;
  to: string;
  verificationUrl: string;
};

export abstract class MailProvider {
  abstract sendPasswordResetEmail(email: PasswordResetEmail): Promise<void>;
  abstract sendEmailVerificationEmail(
    email: EmailVerificationEmail,
  ): Promise<void>;
}
