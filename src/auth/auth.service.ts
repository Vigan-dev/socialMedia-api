import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

type AuthSession = {
  accessToken: string;
  accessTokenMaxAgeMs: number;
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
  userId: string;
};

const accessTokenMaxAgeMs = 15 * 60 * 1000;
const shortRefreshTokenMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const longRefreshTokenMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const passwordResetTokenMaxAgeMs = 30 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(username: string, email: string, password: string) {
    if (!username || !email || !password) {
      throw new UnauthorizedException(
        'username, email and password are required',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    return this.usersService.create({
      username,
      email,
      password: hashedPassword,
      role: 'user',
    });
  }

  async login(
    email: string,
    password: string,
    rememberMe = false,
  ): Promise<AuthSession> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.isSuspended) {
      throw new UnauthorizedException('Account suspended');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createSession(
      user._id.toString(),
      user.email,
      user.role,
      rememberMe,
    );
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    let payload: {
      sub: string;
      email: string;
      role: string;
      rememberMe?: boolean;
    };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findByIdWithRefreshToken(payload.sub);

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (user.isSuspended) {
      throw new UnauthorizedException('Account suspended');
    }

    const isMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.createSession(
      user._id.toString(),
      user.email,
      user.role,
      Boolean(payload.rememberMe),
    );
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        refreshToken,
      );
      await this.usersService.clearRefreshTokenHash(payload.sub);
    } catch {
      return;
    }
  }

  async getSessionUser(userId: string) {
    return this.usersService.getProfile(userId);
  }

  async requestPasswordReset(email: string) {
    const user = await this.usersService.findByEmail(email);
    const message =
      'If an account exists for that email, a reset link has been sent.';

    if (!user) {
      return { message };
    }

    const resetToken = randomBytes(32).toString('hex');
    await this.usersService.updatePasswordResetToken(
      user._id.toString(),
      await bcrypt.hash(resetToken, 10),
      new Date(Date.now() + passwordResetTokenMaxAgeMs),
    );

    if (process.env.NODE_ENV === 'production') {
      return { message };
    }

    return { message, resetToken };
  }

  async resetPassword(email: string, token: string, password: string) {
    const user = await this.usersService.findByEmailWithPasswordReset(email);

    if (
      !user?.passwordResetTokenHash ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const isMatch = await bcrypt.compare(token, user.passwordResetTokenHash);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const didResetPassword =
      await this.usersService.updatePasswordWithResetToken(
        user._id.toString(),
        await bcrypt.hash(password, 10),
        user.passwordResetTokenHash,
      );

    if (!didResetPassword) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    return { message: 'Password reset successfully.' };
  }

  private async createSession(
    userId: string,
    email: string,
    role: string,
    rememberMe: boolean,
  ): Promise<AuthSession> {
    const refreshTokenMaxAgeMs = rememberMe
      ? longRefreshTokenMaxAgeMs
      : shortRefreshTokenMaxAgeMs;

    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email, role },
      { expiresIn: `${accessTokenMaxAgeMs / 1000}s` },
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: userId,
        email,
        role,
        rememberMe,
        tokenId: randomBytes(16).toString('hex'),
      },
      { expiresIn: `${refreshTokenMaxAgeMs / 1000}s` },
    );

    await this.usersService.updateRefreshTokenHash(
      userId,
      await bcrypt.hash(refreshToken, 10),
    );

    return {
      accessToken,
      accessTokenMaxAgeMs,
      refreshToken,
      refreshTokenMaxAgeMs,
      userId,
    };
  }
}
