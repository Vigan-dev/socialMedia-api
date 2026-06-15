import { NotificationType } from '../schemas/notification.schema';

export type NotificationResponse = {
  actorAvatarUrl: string | null;
  actorId: string | null;
  content: string;
  id: string;
  meta: string;
  postId: string | null;
  read: boolean;
  time: string;
  type: NotificationType;
  user: string;
};
