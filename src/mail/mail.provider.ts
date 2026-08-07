export type PasswordResetEmail = {
  expiresInMinutes: number;
  resetUrl: string;
  to: string;
};

export abstract class MailProvider {
  abstract sendPasswordResetEmail(email: PasswordResetEmail): Promise<void>;
}
