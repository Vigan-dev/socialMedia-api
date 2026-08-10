import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import { Notification } from './schemas/notification.schema';
import type {
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import type { NotificationResponse } from './dto/notification-response.dto';
import { normalizeUsernameLower } from '../users/user-identity';
import {
  buildCursorPage,
  decodeCursor,
  encodeCursor,
  parsePageLimit,
} from '../common/pagination/cursor-pagination';
import { RealtimePublisher } from '../realtime/realtime.publisher';

type CreateNotificationInput = {
  actorId: string;
  content?: string;
  postId?: string;
  recipientId?: string;
  type: NotificationType;
};

type NotificationPageQuery = {
  cursor?: string;
  limit?: string;
};

type PopulatedUser = {
  _id: Types.ObjectId;
  username: string;
  avatarUrl?: string;
};

type NotificationWithActor = {
  _id: Types.ObjectId;
  actor?: PopulatedUser | null;
  content?: string;
  createdAt?: Date;
  post?: Types.ObjectId;
  read: boolean;
  type: NotificationType;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly realtimePublisher: RealtimePublisher,
  ) {}

  async findForUser(userId: string, query: NotificationPageQuery = {}) {
    const limit = parsePageLimit(query.limit, 30, 50);
    const boundary = decodeCursor('notifications', query.cursor);
    const notificationFilter: Record<string, unknown> = {
      recipient: new Types.ObjectId(userId),
    };

    if (boundary) {
      const createdAt = new Date(boundary.sortValue);

      if (
        Number.isNaN(createdAt.getTime()) ||
        !Types.ObjectId.isValid(boundary.id)
      ) {
        throw new BadRequestException('Invalid pagination cursor');
      }

      notificationFilter.$or = [
        { createdAt: { $lt: createdAt } },
        {
          createdAt,
          _id: { $lt: new Types.ObjectId(boundary.id) },
        },
      ];
    }

    const notifications = await this.notificationModel
      .find(notificationFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate<{ actor: PopulatedUser }>('actor', 'username avatarUrl')
      .exec();
    const page = buildCursorPage(notifications, limit, (notification) =>
      encodeCursor('notifications', {
        id: notification._id.toString(),
        sortValue: notification.createdAt.toISOString(),
      }),
    );

    return {
      ...page,
      items: page.items.map((notification) =>
        this.toResponse(notification.toObject() as NotificationWithActor),
      ),
    };
  }

  async create(
    input: CreateNotificationInput,
  ): Promise<NotificationDocument | null> {
    if (!input.recipientId || input.recipientId === input.actorId) {
      return null;
    }

    const recipient = await this.userModel.findById(input.recipientId);

    if (!recipient || !this.allowsNotification(recipient, input.type)) {
      return null;
    }

    const notification = await this.notificationModel.create({
      actor: new Types.ObjectId(input.actorId),
      content: input.content?.trim() ?? '',
      post: input.postId ? new Types.ObjectId(input.postId) : undefined,
      recipient: new Types.ObjectId(input.recipientId),
      type: input.type,
    });

    try {
      const populated = await notification.populate<{ actor: PopulatedUser }>(
        'actor',
        'username avatarUrl',
      );
      const response = this.toResponse(
        populated.toObject() as unknown as NotificationWithActor,
      );
      this.realtimePublisher.publishNotification(input.recipientId, response);
    } catch (error) {
      this.logger.warn(
        `Notification ${notification._id.toString()} was stored but realtime delivery failed`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return notification;
  }

  async createMentions(input: {
    actorId: string;
    content: string;
    postId?: string;
  }) {
    const usernames = this.extractMentionedUsernames(input.content);

    if (usernames.length === 0) {
      return [];
    }

    const users = await this.userModel
      .find({
        usernameLower: { $in: usernames.map(normalizeUsernameLower) },
      })
      .exec();

    const allowedUsers = users.filter((user) => {
      if (user.privacy?.allowMentionsFrom === 'none') return false;

      if (user.privacy?.allowMentionsFrom === 'following') {
        return user.following?.some((id) => id.toString() === input.actorId);
      }

      return true;
    });

    return Promise.all(
      allowedUsers.map((user) =>
        this.create({
          actorId: input.actorId,
          content: input.content,
          postId: input.postId,
          recipientId: this.getUserId(user),
          type: 'mention',
        }),
      ),
    );
  }

  async markAllRead(userId: string) {
    await this.notificationModel.updateMany(
      { recipient: new Types.ObjectId(userId), read: false },
      { read: true },
    );

    this.realtimePublisher.publishNotificationsRead(userId);

    return this.findForUser(userId);
  }

  async deleteForPost(postId: string) {
    if (!Types.ObjectId.isValid(postId)) return;

    await this.notificationModel.deleteMany({
      post: new Types.ObjectId(postId),
    });
  }

  private extractMentionedUsernames(content: string) {
    const matches: string[] = content.match(/@[\w.-]+/g) ?? [];
    const normalized: string[] = matches.flatMap((match: string) => {
      const username = match.slice(1).trim().toLowerCase();

      return [username, username.replace(/_/g, ' ')];
    });

    return Array.from(new Set(normalized)).filter(Boolean);
  }

  private toResponse(
    notification: NotificationWithActor,
  ): NotificationResponse {
    const actorName = notification.actor?.username ?? 'Someone';

    return {
      id: notification._id.toString(),
      actorAvatarUrl: notification.actor?.avatarUrl || null,
      actorId: notification.actor?._id?.toString() ?? null,
      content: notification.content ?? '',
      meta: this.getMeta(notification.type),
      postId: notification.post?.toString() ?? null,
      read: notification.read,
      time: (notification.createdAt ?? new Date()).toISOString(),
      type: notification.type,
      user: actorName,
    };
  }

  private getMeta(type: NotificationType) {
    if (type === 'like') return 'liked your post.';
    if (type === 'comment') return 'commented on your post.';
    if (type === 'repost') return 'reposted your post.';
    if (type === 'follow') return 'started following you.';
    if (type === 'follow_request') return 'requested to follow you.';
    if (type === 'follow_accept') return 'accepted your follow request.';
    if (type === 'message') return 'sent you a message.';
    return 'mentioned you.';
  }

  private allowsNotification(user: UserDocument, type: NotificationType) {
    const settings = user.notificationSettings;

    if (type === 'like' || type === 'repost') return settings?.likes ?? true;
    if (type === 'comment') return settings?.comments ?? true;
    if (
      type === 'follow' ||
      type === 'follow_request' ||
      type === 'follow_accept'
    ) {
      return settings?.follows ?? true;
    }
    if (type === 'mention') return settings?.mentions ?? true;
    return settings?.messages ?? true;
  }

  private getUserId(user: UserDocument) {
    return user._id.toString();
  }
}
