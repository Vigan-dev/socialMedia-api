import { SupportChatConversationSchema } from '../../ai/schemas/conversation.schema';
import { ConversationSchema } from '../../conversations/schemas/conversation.schema';
import { MessageSchema } from '../../conversations/schemas/message.schema';
import { NotificationSchema } from '../../notifications/schemas/notification.schema';

describe('pagination indexes', () => {
  it.each([
    [ConversationSchema, { participants: 1, updatedAt: -1, _id: -1 }],
    [MessageSchema, { conversation: 1, createdAt: -1, _id: -1 }],
    [NotificationSchema, { recipient: 1, createdAt: -1, _id: -1 }],
    [SupportChatConversationSchema, { userId: 1, lastMessageAt: -1, _id: -1 }],
  ])('declares the compound query index', (schema, expectedIndex) => {
    expect(schema.indexes()).toEqual(
      expect.arrayContaining([[expectedIndex, expect.any(Object)]]),
    );
  });
});
