import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { ConversationResponse } from '../conversations/dto/conversation-response.dto';
import type { NotificationResponse } from '../notifications/dto/notification-response.dto';
import type {
  RealtimeClientEvents,
  RealtimeInterServerEvents,
  RealtimeMessageEvent,
  RealtimeMessageReadEvent,
  RealtimeServerEvents,
  RealtimeSocketData,
} from './realtime-events';

type RealtimeServer = Server<
  RealtimeClientEvents,
  RealtimeServerEvents,
  RealtimeInterServerEvents,
  RealtimeSocketData
>;

@Injectable()
export class RealtimePublisher {
  private server?: RealtimeServer;

  bindServer(server: RealtimeServer) {
    this.server = server;
  }

  publishConversation(userId: string, conversation: ConversationResponse) {
    this.server
      ?.to(this.userRoom(userId))
      .emit('conversation:updated', conversation);
  }

  publishMessage(userId: string, event: RealtimeMessageEvent) {
    this.server?.to(this.userRoom(userId)).emit('message:new', event);
  }

  publishMessageRead(userId: string, event: RealtimeMessageReadEvent) {
    this.server?.to(this.userRoom(userId)).emit('message:read', event);
  }

  publishNotification(userId: string, notification: NotificationResponse) {
    this.server
      ?.to(this.userRoom(userId))
      .emit('notification:new', notification);
  }

  publishNotificationsRead(userId: string) {
    this.server?.to(this.userRoom(userId)).emit('notification:read-all');
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }
}
