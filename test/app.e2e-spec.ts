import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AdminBootstrapService } from '../src/admin/admin-bootstrap.service';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.setup';
import { AuthEvent } from '../src/auth/schemas/auth-event.schema';
import type { AuthEventDocument } from '../src/auth/schemas/auth-event.schema';
import { Conversation } from '../src/conversations/schemas/conversation.schema';
import type { ConversationDocument } from '../src/conversations/schemas/conversation.schema';
import { Message } from '../src/conversations/schemas/message.schema';
import type { MessageDocument } from '../src/conversations/schemas/message.schema';
import { Notification } from '../src/notifications/schemas/notification.schema';
import type { NotificationDocument } from '../src/notifications/schemas/notification.schema';
import { Post } from '../src/posts/schemas/post.schema';
import type { PostDocument } from '../src/posts/schemas/post.schema';
import { SavedCollection } from '../src/posts/schemas/saved-collection.schema';
import type { SavedCollectionDocument } from '../src/posts/schemas/saved-collection.schema';
import { User } from '../src/users/schemas/user.schema';
import type { UserDocument } from '../src/users/schemas/user.schema';

jest.setTimeout(120_000);

type TestAccount = {
  email: string;
  password: string;
  username: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an object response body');
  }

  return value as Record<string, unknown>;
}

function responseRecord(response: request.Response) {
  return asRecord(response.body as unknown);
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(`Expected ${key} to be a non-empty string`);
  }

  return value;
}

function readArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${key} to be an array`);
  }

  return value as unknown[];
}

describe('SocialMedia live flows (e2e)', () => {
  const runId = `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  const password = 'E2ePassword1';
  const ownerAccount: TestAccount = {
    email: `e2e-owner-${runId}@example.com`,
    password,
    username: `e2e_owner_${runId}`,
  };
  const peerAccount: TestAccount = {
    email: `e2e-peer-${runId}@example.com`,
    password,
    username: `e2e_peer_${runId}`,
  };
  const testEmails = [ownerAccount.email, peerAccount.email];

  let app: INestApplication<App>;
  let clientOrigin: string;
  let authEventModel: Model<AuthEventDocument>;
  let collectionModel: Model<SavedCollectionDocument>;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let notificationModel: Model<NotificationDocument>;
  let postModel: Model<PostDocument>;
  let userModel: Model<UserDocument>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AdminBootstrapService)
      .useValue({ onApplicationBootstrap: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();

    const configService = app.get(ConfigService);
    clientOrigin = configService.getOrThrow<string>('CLIENT_ORIGIN');
    authEventModel = app.get<Model<AuthEventDocument>>(
      getModelToken(AuthEvent.name),
    );
    collectionModel = app.get<Model<SavedCollectionDocument>>(
      getModelToken(SavedCollection.name),
    );
    conversationModel = app.get<Model<ConversationDocument>>(
      getModelToken(Conversation.name),
    );
    messageModel = app.get<Model<MessageDocument>>(getModelToken(Message.name));
    notificationModel = app.get<Model<NotificationDocument>>(
      getModelToken(Notification.name),
    );
    postModel = app.get<Model<PostDocument>>(getModelToken(Post.name));
    userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  });

  afterAll(async () => {
    try {
      const users = await userModel
        .find({ emailLower: { $in: testEmails } })
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>()
        .exec();
      const userIds = users.map((user) => user._id);
      const [posts, conversations] = await Promise.all([
        postModel
          .find({ author: { $in: userIds } })
          .select('_id')
          .lean<Array<{ _id: Types.ObjectId }>>()
          .exec(),
        conversationModel
          .find({ participants: { $in: userIds } })
          .select('_id')
          .lean<Array<{ _id: Types.ObjectId }>>()
          .exec(),
      ]);
      const postIds = posts.map((post) => post._id);
      const conversationIds = conversations.map(
        (conversation) => conversation._id,
      );

      await Promise.all([
        authEventModel.deleteMany({ user: { $in: userIds } }),
        collectionModel.deleteMany({ owner: { $in: userIds } }),
        messageModel.deleteMany({
          $or: [
            { conversation: { $in: conversationIds } },
            { sender: { $in: userIds } },
          ],
        }),
        conversationModel.deleteMany({ _id: { $in: conversationIds } }),
        notificationModel.deleteMany({
          $or: [
            { actor: { $in: userIds } },
            { post: { $in: postIds } },
            { recipient: { $in: userIds } },
          ],
        }),
        postModel.deleteMany({ _id: { $in: postIds } }),
        userModel.deleteMany({ _id: { $in: userIds } }),
      ]);
    } finally {
      await app.close();
    }
  });

  async function createVerifiedSession(account: TestAccount) {
    const agent = request.agent(app.getHttpServer());
    const registration = await agent
      .post('/auth/register')
      .set('Origin', clientOrigin)
      .send(account)
      .expect(201);
    const verificationToken = readString(
      responseRecord(registration),
      'verificationToken',
    );

    await agent
      .post('/auth/verify-email')
      .set('Origin', clientOrigin)
      .send({ email: account.email, token: verificationToken })
      .expect(201);
    await agent
      .post('/auth/login')
      .set('Origin', clientOrigin)
      .send({ email: account.email, password: account.password })
      .expect(201)
      .expect({ ok: true });

    const profile = await agent.get('/users/me').expect(200);
    return {
      agent,
      id: readString(responseRecord(profile), 'id'),
    };
  }

  it('runs verified auth, private follow, post, saved, messaging, notification, and search flows', async () => {
    const server = app.getHttpServer();

    await request(server).get('/users/me').expect(401);
    await request(server).post('/auth/register').send(ownerAccount).expect(403);

    const owner = await createVerifiedSession(ownerAccount);
    const peer = await createVerifiedSession(peerAccount);

    await owner.agent
      .patch('/users/privacy')
      .set('Origin', clientOrigin)
      .send({ profileVisibility: 'private' })
      .expect(200);

    const followRequest = await peer.agent
      .put(`/users/${owner.id}/follow`)
      .set('Origin', clientOrigin)
      .expect(200);
    expect(responseRecord(followRequest).isFollowRequested).toBe(true);

    const pendingRequests = await owner.agent
      .get('/users/me/follow-requests')
      .expect(200);
    expect(
      readArray(responseRecord(pendingRequests), 'items')
        .map(asRecord)
        .some((item) => item.id === peer.id),
    ).toBe(true);

    await owner.agent
      .put(`/users/follow-requests/${peer.id}`)
      .set('Origin', clientOrigin)
      .expect(200);

    const searchToken = `liveflow${runId}`;
    const createdPost = await owner.agent
      .post('/posts')
      .set('Origin', clientOrigin)
      .send({ content: `Live flow ${searchToken} #${searchToken}` })
      .expect(201);
    const postId = readString(responseRecord(createdPost), 'id');

    const likedPost = await peer.agent
      .put(`/posts/${postId}/like`)
      .set('Origin', clientOrigin)
      .expect(200);
    expect(responseRecord(likedPost).isLiked).toBe(true);

    const commentedPost = await peer.agent
      .post(`/posts/${postId}/comments`)
      .set('Origin', clientOrigin)
      .send({ content: 'Live e2e comment' })
      .expect(201);
    const commentedPostBody = responseRecord(commentedPost);
    expect(commentedPostBody.comments).toBe(1);
    expect(
      readArray(commentedPostBody, 'commentItems')
        .map(asRecord)
        .some((comment) => comment.content === 'Live e2e comment'),
    ).toBe(true);

    const savedPost = await peer.agent
      .put(`/saved-posts/${postId}`)
      .set('Origin', clientOrigin)
      .expect(200);
    expect(responseRecord(savedPost).isSaved).toBe(true);

    const createdCollection = await peer.agent
      .post('/saved-posts/collections')
      .set('Origin', clientOrigin)
      .send({ name: 'Live e2e collection' })
      .expect(201);
    const collectionId = readString(responseRecord(createdCollection), 'id');
    const populatedCollection = await peer.agent
      .put(`/saved-posts/collections/${collectionId}/posts/${postId}`)
      .set('Origin', clientOrigin)
      .expect(200);
    expect(responseRecord(populatedCollection).postIds).toContain(postId);

    const createdConversation = await peer.agent
      .post('/conversations')
      .set('Origin', clientOrigin)
      .send({ participantId: owner.id })
      .expect(201);
    const conversationId = readString(
      responseRecord(createdConversation),
      'id',
    );
    await peer.agent
      .post(`/conversations/${conversationId}/messages`)
      .set('Origin', clientOrigin)
      .send({ body: 'Live e2e message' })
      .expect(201)
      .expect((response) => {
        expect(responseRecord(response).text).toBe('Live e2e message');
      });

    const messages = await owner.agent
      .get(`/conversations/${conversationId}/messages`)
      .expect(200);
    expect(
      readArray(responseRecord(messages), 'items')
        .map(asRecord)
        .some((message) => message.text === 'Live e2e message'),
    ).toBe(true);

    const search = await peer.agent
      .get('/search')
      .query({ limit: '20', q: searchToken, type: 'all' })
      .expect(200);
    const searchBody = responseRecord(search);
    expect(searchBody.query).toBe(searchToken);
    expect(
      readArray(searchBody, 'posts')
        .map(asRecord)
        .some((post) => post.id === postId),
    ).toBe(true);
    expect(
      readArray(searchBody, 'hashtags')
        .map(asRecord)
        .some((hashtag) => hashtag.tag === `#${searchToken}`),
    ).toBe(true);

    const notifications = await owner.agent.get('/notifications').expect(200);
    const notificationTypes = readArray(
      responseRecord(notifications),
      'items',
    ).map((notification) => asRecord(notification).type);
    expect(notificationTypes).toEqual(
      expect.arrayContaining(['follow_request', 'like', 'comment', 'message']),
    );
  });
});
