import type {
  ConversationResponse,
  MessageResponse,
} from '../conversations/dto/conversation-response.dto';
import type { NotificationResponse } from '../notifications/dto/notification-response.dto';

export type RealtimeMessageEvent = {
  conversationId: string;
  message: MessageResponse;
};

export type RealtimeMessageReadEvent = {
  conversationId: string;
};

export interface RealtimeServerEvents {
  'conversation:updated': (conversation: ConversationResponse) => void;
  'message:new': (event: RealtimeMessageEvent) => void;
  'message:read': (event: RealtimeMessageReadEvent) => void;
  'notification:new': (notification: NotificationResponse) => void;
  'notification:read-all': () => void;
}

export type RealtimeClientEvents = {
  'realtime:ping': () => void;
};

export type RealtimeInterServerEvents = {
  'realtime:sync': () => void;
};

export type RealtimeSocketData = {
  userId?: string;
};
