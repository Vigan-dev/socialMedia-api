import { Types } from 'mongoose';
import { NotificationsService } from './notifications.service';

describe('NotificationsService realtime delivery', () => {
  it('publishes the mapped notification only after it is stored', async () => {
    const actorId = new Types.ObjectId();
    const recipientId = new Types.ObjectId();
    const notificationId = new Types.ObjectId();
    const createdAt = new Date('2026-08-07T10:00:00.000Z');
    const notification = {
      populate: jest.fn(),
      toObject: jest.fn(() => ({
        _id: notificationId,
        actor: {
          _id: actorId,
          avatarUrl: '/uploads/avatars/actor.png',
          username: 'Actor',
        },
        content: 'Hello',
        createdAt,
        read: false,
        type: 'message',
      })),
    };
    notification.populate.mockResolvedValue(notification);
    const notificationModel = {
      create: jest.fn().mockResolvedValue(notification),
    };
    const userModel = {
      findById: jest.fn().mockResolvedValue({
        notificationSettings: { messages: true },
      }),
    };
    const realtimePublisher = { publishNotification: jest.fn() };
    const service = new NotificationsService(
      notificationModel as never,
      userModel as never,
      realtimePublisher as never,
    );

    await service.create({
      actorId: actorId.toString(),
      content: 'Hello',
      recipientId: recipientId.toString(),
      type: 'message',
    });

    expect(realtimePublisher.publishNotification).toHaveBeenCalledWith(
      recipientId.toString(),
      expect.objectContaining({
        id: notificationId.toString(),
        read: false,
        type: 'message',
        user: 'Actor',
      }),
    );
  });
});
