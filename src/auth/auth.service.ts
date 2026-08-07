import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { MailProvider } from '../mail/mail.provider';
import type { UserRole } from './roles';
import {
  accessTokenAudience,
  isRefreshTokenPayload,
  jwtIssuer,
  refreshTokenAudience,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from './auth-token';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import type { RequestMetadata } from '../security/request-metadata';
import {
  AuthEvent,
  type AuthEventDocument,
  type AuthEventType,
} from './schemas/auth-event.schema';

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
const passwordResetTokenMaxAgeMinutes =
  passwordResetTokenMaxAgeMs / (60 * 1000);
const dummyPasswordHash =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const unknownRequestMetadata: RequestMetadata = {
  ip: 'unknown',
  userAgent: 'unknown',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailProvider: MailProvider,
    @InjectModel(AuthEvent.name)
    private readonly authEventModel: Model<AuthEventDocument>,
    private readonly realtimePublisher: RealtimePublisher,
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
    metadata: RequestMetadata = unknownRequestMetadata,
  ): Promise<AuthSession> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      await bcrypt.compare(password, dummyPasswordHash);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.isSuspended) {
      throw new UnauthorizedException('Account suspended');
    }

    const loginLockedUntil = user.loginLockedUntil;
    if (loginLockedUntil && loginLockedUntil.getTime() > Date.now()) {
      await this.recordEvent(user._id.toString(), 'login_locked', metadata);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((loginLockedUntil.getTime() - Date.now()) / 1000),
      );

      throw new HttpException(
        {
          message: 'Account temporarily locked after repeated login failures',
          retryAfterSeconds,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      await this.usersService.recordFailedLogin(user._id.toString());
      await this.recordEvent(user._id.toString(), 'login_failure', metadata);
      throw new UnauthorizedException('Invalid email or password');
    }

    const session = await this.createSession(
      user._id.toString(),
      user.email,
      user.role,
      rememberMe,
      user.securityVersion ?? 0,
    );
    await this.usersService.clearFailedLoginState(user._id.toString());
    await this.recordEvent(user._id.toString(), 'login_success', metadata);

    return session;
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    let payload: unknown;

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        audience: refreshTokenAudience,
        issuer: jwtIssuer,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!isRefreshTokenPayload(payload)) {
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
      user.securityVersion ?? 0,
    );
  }

  async logout(refreshToken: string) {
    try {
      const payload: unknown = await this.jwtService.verifyAsync(refreshToken, {
        audience: refreshTokenAudience,
        issuer: jwtIssuer,
      });

      if (!isRefreshTokenPayload(payload)) {
        return;
      }

      await this.usersService.clearRefreshTokenHash(payload.sub);
    } catch {
      return;
    }
  }

  async getSessionUser(userId: string) {
    return this.usersService.getProfile(userId);
  }

  async getSecurityActivity(userId: string) {
    const events = await this.authEventModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .lean()
      .exec();

    return {
      items: events.map((event) => ({
        id: event._id.toString(),
        ip: event.ip,
        time: event.createdAt.toISOString(),
        type: event.type,
        userAgent: event.userAgent,
      })),
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    metadata: RequestMetadata = unknownRequestMetadata,
  ) {
    const user =
      await this.usersService.findByIdWithPasswordAndSecurity(userId);

    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      await this.recordEvent(userId, 'password_change_failed', metadata);
      throw new ForbiddenException('Current password is incorrect');
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    await this.usersService.updatePasswordAndInvalidateSessions(
      userId,
      await bcrypt.hash(newPassword, 10),
    );
    await this.recordEvent(userId, 'password_changed', metadata);
    this.realtimePublisher.revokeUserSessions(userId);

    return { message: 'Password changed. Sign in again on your devices.' };
  }

  async revokeAllSessions(
    userId: string,
    metadata: RequestMetadata = unknownRequestMetadata,
  ) {
    await this.usersService.invalidateSessions(userId);
    await this.recordEvent(userId, 'sessions_revoked', metadata);
    this.realtimePublisher.revokeUserSessions(userId);

    return { message: 'All sessions have been signed out.' };
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

    const resetUrl = new URL(
      '/forgot-password',
      this.configService.getOrThrow<string>('CLIENT_ORIGIN'),
    );
    resetUrl.searchParams.set('email', user.email);
    resetUrl.searchParams.set('token', resetToken);

    await this.mailProvider.sendPasswordResetEmail({
      expiresInMinutes: passwordResetTokenMaxAgeMinutes,
      resetUrl: resetUrl.toString(),
      to: user.email,
    });

    return this.canExposePasswordResetToken()
      ? { message, resetToken }
      : { message };
  }

  async resetPassword(
    email: string,
    token: string,
    password: string,
    metadata: RequestMetadata = unknownRequestMetadata,
  ) {
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

    const userId = user._id.toString();
    await this.recordEvent(userId, 'password_reset', metadata);
    this.realtimePublisher.revokeUserSessions(userId);

    return { message: 'Password reset successfully.' };
  }

  private async createSession(
    userId: string,
    email: string,
    role: UserRole,
    rememberMe: boolean,
    sessionVersion: number,
  ): Promise<AuthSession> {
    const refreshTokenMaxAgeMs = rememberMe
      ? longRefreshTokenMaxAgeMs
      : shortRefreshTokenMaxAgeMs;

    const accessTokenPayload: AccessTokenPayload = {
      email,
      role,
      sessionVersion,
      sub: userId,
      tokenType: 'access',
    };
    const refreshTokenPayload: RefreshTokenPayload = {
      rememberMe,
      sub: userId,
      tokenId: randomBytes(16).toString('hex'),
      tokenType: 'refresh',
    };
    const accessToken = await this.jwtService.signAsync(accessTokenPayload, {
      audience: accessTokenAudience,
      expiresIn: `${accessTokenMaxAgeMs / 1000}s`,
      issuer: jwtIssuer,
    });
    const refreshToken = await this.jwtService.signAsync(refreshTokenPayload, {
      audience: refreshTokenAudience,
      expiresIn: `${refreshTokenMaxAgeMs / 1000}s`,
      issuer: jwtIssuer,
    });

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

  private canExposePasswordResetToken() {
    const nodeEnvironment = this.configService
      .get<string>('NODE_ENV')
      ?.trim()
      .toLowerCase();

    return nodeEnvironment === 'development' || nodeEnvironment === 'test';
  }

  private async recordEvent(
    userId: string,
    type: AuthEventType,
    metadata: RequestMetadata,
  ) {
    if (!Types.ObjectId.isValid(userId)) return;

    try {
      await this.authEventModel.create({
        ip: metadata.ip,
        type,
        user: new Types.ObjectId(userId),
        userAgent: metadata.userAgent,
      });
    } catch (error) {
      this.logger.warn(
        `Could not store ${type} security activity for user ${userId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
