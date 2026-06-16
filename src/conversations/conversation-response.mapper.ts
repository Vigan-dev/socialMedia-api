import { Types } from 'mongoose';
import type {
  ConversationResponse,
  MessageResponse,
} from './dto/conversation-response.dto';

type MongooseObjectSource = {
  toObject<T>(options?: { depopulate?: boolean }): T;
};

type PopulatedUser = {
  _id: Types.ObjectId;
  avatarUrl?: string;
  showOnlineStatus?: boolean;
  status?: string;
  username: string;
};

type ConversationObject = {
  _id: Types.ObjectId;
  lastMessage?: string;
  lastMessageAt?: Date;
  participants: Array<Types.ObjectId | PopulatedUser>;
  typing?: Array<{ user: Types.ObjectId | PopulatedUser; expiresAt: Date }>;
  unreadCounts?: Map<string, number> | Record<string, number>;
  updatedAt?: Date;
};

type MessageObject = {
  _id: Types.ObjectId;
  body: string;
  createdAt?: Date;
  deliveredTo?: Types.ObjectId[];
  readBy?: Array<{ user: Types.ObjectId; readAt: Date }>;
  sender: Types.ObjectId | PopulatedUser;
};

type UnreadCounts = Map<string, number> | Record<string, number> | undefined;

function isPopulatedUser(value: Types.ObjectId | PopulatedUser): value is PopulatedUser {
  return !(value instanceof Types.ObjectId);
}

function getUserId(user: Types.ObjectId | PopulatedUser) {
  return user instanceof Types.ObjectId ? user.toString() : user._id.toString();
}

function getUnreadCount(unreadCounts: UnreadCounts, userId: string) {
  if (unreadCounts instanceof Map) {
    return Number(unreadCounts.get(userId) ?? 0);
  }

  return Number(unreadCounts?.[userId] ?? 0);
}

export function mapConversationDocumentToResponse(
  conversation: MongooseObjectSource,
  currentUserId: string,
): ConversationResponse {
  const data = conversation.toObject<ConversationObject>({ depopulate: false });
  const participants = data.participants.filter(isPopulatedUser);
  const otherParticipant =
    participants.find(
      (participant) => participant._id.toString() !== currentUserId,
    ) ?? participants[0];

  if (!otherParticipant) {
    throw new Error('Conversation participant must be populated.');
  }

  const now = Date.now();
  const typingUsers = (data.typing ?? [])
    .filter(
      (entry) =>
        getUserId(entry.user) !== currentUserId &&
        new Date(entry.expiresAt).getTime() > now,
    )
    .map((entry) => (isPopulatedUser(entry.user) ? entry.user.username : ''))
    .filter(Boolean);

  return {
    id: data._id.toString(),
    handle: `@${otherParticipant.username.toLowerCase().replace(/\s+/g, '_')}`,
    lastMessage: data.lastMessage || 'No messages yet',
    lastMessageAt:
      data.lastMessageAt?.toISOString() ??
      data.updatedAt?.toISOString() ??
      null,
    participant: {
      avatarUrl: otherParticipant.avatarUrl || null,
      id: otherParticipant._id.toString(),
      name: otherParticipant.username,
      status:
        otherParticipant.showOnlineStatus === false
          ? 'away'
          : (otherParticipant.status ?? 'available'),
    },
    typingUsers,
    unreadCount: getUnreadCount(data.unreadCounts, currentUserId),
    user: otherParticipant.username,
  };
}

export function mapMessageDocumentToResponse(
  message: MongooseObjectSource,
  currentUserId: string,
): MessageResponse {
  const data = message.toObject<MessageObject>({ depopulate: false });

  if (!isPopulatedUser(data.sender)) {
    throw new Error('Message sender must be populated.');
  }

  const senderId = data.sender._id.toString();

  return {
    id: data._id.toString(),
    delivered: Boolean(data.deliveredTo?.length),
    isOwn: senderId === currentUserId,
    read: Boolean(
      data.readBy?.some((entry) => entry.user.toString() !== senderId),
    ),
    sender: {
      avatarUrl: data.sender.avatarUrl || null,
      id: senderId,
      name: data.sender.username,
    },
    text: data.body,
    time: (data.createdAt ?? new Date()).toISOString(),
  };
}
