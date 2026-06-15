import { Injectable } from '@nestjs/common';
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

type CreateNotificationInput = {
  actorId: string;
  content?: string;
  postId?: string;
  recipientId?: string;
  type: NotificationType;
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
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findForUser(userId: string): Promise<NotificationResponse[]> {
    const notifications = await this.notificationModel
      .find({ recipient: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate<{ actor: PopulatedUser }>('actor', 'username avatarUrl')
      .exec();

    return notifications.map((notification) =>
      this.toResponse(notification.toObject() as NotificationWithActor),
    );
  }

  async create(input: CreateNotificationInput) {
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
        username: {
          $in: usernames.map(
            (username) => new RegExp(`^${this.escapeRegex(username)}$`, 'i'),
          ),
        },
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

  async markAllRead(userId: string): Promise<NotificationResponse[]> {
    await this.notificationModel.updateMany(
      { recipient: new Types.ObjectId(userId), read: false },
      { read: true },
    );

    return this.findForUser(userId);
  }

  async deleteForPost(postId: string) {
    if (!Types.ObjectId.isValid(postId)) return;

    await this.notificationModel.deleteMany({
      post: new Types.ObjectId(postId),
    });
  }

  private extractMentionedUsernames(content: string) {
    const matches = content.match(/@[\w.-]+/g) ?? [];
    const normalized = matches.flatMap((match) => {
      const username = match.slice(1).trim().toLowerCase();

      return [username, username.replace(/_/g, ' ')];
    });

    return Array.from(new Set(normalized)).filter(Boolean);
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    if (type === 'follow') return 'started following you.';
    if (type === 'message') return 'sent you a message.';
    return 'mentioned you.';
  }

  private allowsNotification(user: UserDocument, type: NotificationType) {
    const settings = user.notificationSettings;

    if (type === 'like') return settings?.likes ?? true;
    if (type === 'comment') return settings?.comments ?? true;
    if (type === 'follow') return settings?.follows ?? true;
    if (type === 'mention') return settings?.mentions ?? true;
    return settings?.messages ?? true;
  }

  private getUserId(user: UserDocument) {
    return user._id.toString();
  }
}
