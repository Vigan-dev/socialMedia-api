import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { PipelineStage } from 'mongoose';
import {
  SupportChatMessage,
  SupportChatMessageDocument,
} from './schemas/support-chat-message.schema';
import {
  SupportChatConversation,
  SupportChatConversationDocument,
} from './schemas/conversation.schema';
import {
  buildCursorPage,
  decodeCursor,
  encodeCursor,
  parsePageLimit,
} from '../common/pagination/cursor-pagination';

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

type OllamaChatMessage = {
  role: 'assistant' | 'system' | 'user';
  content: string;
};

type SupportSessionPageQuery = {
  cursor?: string;
  limit?: string;
};

@Injectable()
export class AiService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(SupportChatMessage.name)
    private readonly supportChatMessageModel: Model<SupportChatMessageDocument>,
    @InjectModel(SupportChatConversation.name)
    private readonly supportChatConversationModel: Model<SupportChatConversationDocument>,
  ) {}

  async createSupportReply(
    userId: string,
    message: string,
    sessionId?: string,
  ) {
    const trimmedMessage = message?.trim();

    if (!trimmedMessage) {
      throw new BadRequestException('Message is required');
    }

    const resolvedSessionId = await this.resolveSessionId(userId, sessionId);
    const ollamaModel =
      this.configService.get<string>('OLLAMA_MODEL') ?? 'llama3.2:3b';
    const conversationHistory = await this.getOllamaHistory(
      userId,
      resolvedSessionId,
    );
    const assistantMessage = await this.askOllama(
      [...conversationHistory, { role: 'user', content: trimmedMessage }],
      ollamaModel,
    );

    const chatMessage = await this.supportChatMessageModel.create({
      userId,
      sessionId: resolvedSessionId,
      userMessage: trimmedMessage,
      assistantMessage,
      ollamaModel,
    });

    await this.supportChatConversationModel.updateOne(
      { sessionId: resolvedSessionId, userId },
      {
        $inc: { messageCount: 1 },
        $set: {
          lastMessageAt: chatMessage.createdAt,
          ollamaModel,
        },
        $setOnInsert: {
          firstMessage: trimmedMessage,
          sessionId: resolvedSessionId,
          userId,
        },
      },
      { upsert: true },
    );

    return {
      id: chatMessage.id,
      sessionId: resolvedSessionId,
      message: trimmedMessage,
      reply: assistantMessage,
      model: ollamaModel,
      createdAt: chatMessage.createdAt,
    };
  }

  async getSessionMessages(userId: string, sessionId: string) {
    if (!sessionId?.trim()) {
      throw new BadRequestException('Session id is required');
    }

    return this.supportChatMessageModel
      .find({ sessionId: sessionId.trim(), userId })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async getSessions(userId: string, query: SupportSessionPageQuery = {}) {
    const limit = parsePageLimit(query.limit, 20, 50);
    const boundary = decodeCursor('support-sessions', query.cursor);
    const cursorDate = boundary ? new Date(boundary.sortValue) : null;

    if (cursorDate && Number.isNaN(cursorDate.getTime())) {
      throw new BadRequestException('Invalid pagination cursor');
    }

    const hasConversationRecords = Boolean(
      await this.supportChatConversationModel.exists({ userId }),
    );

    if (hasConversationRecords) {
      if (boundary && !Types.ObjectId.isValid(boundary.id)) {
        throw new BadRequestException('Invalid pagination cursor');
      }

      const filter: Record<string, unknown> = { userId };

      if (boundary && cursorDate) {
        const cursorId = new Types.ObjectId(boundary.id);
        filter.$or = [
          { lastMessageAt: { $lt: cursorDate } },
          { lastMessageAt: cursorDate, _id: { $lt: cursorId } },
        ];
      }

      const conversations = await this.supportChatConversationModel
        .find(filter)
        .sort({ lastMessageAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean()
        .exec();
      const page = buildCursorPage(conversations, limit, (conversation) =>
        encodeCursor('support-sessions', {
          id: conversation._id.toString(),
          sortValue: conversation.lastMessageAt.toISOString(),
        }),
      );

      return {
        ...page,
        items: page.items.map((conversation) => ({
          _id: conversation.sessionId,
          firstMessage: conversation.firstMessage,
          lastMessageAt: conversation.lastMessageAt,
        })),
      };
    }

    const aggregatePipeline: PipelineStage[] = [
      {
        $match: {
          userId,
        },
      },
      {
        $sort: {
          createdAt: 1,
        },
      },
      {
        $group: {
          _id: '$sessionId',
          firstMessage: {
            $first: '$userMessage',
          },
          lastMessageAt: {
            $max: '$createdAt',
          },
        },
      },
    ];

    if (boundary && cursorDate) {
      aggregatePipeline.push({
        $match: {
          $or: [
            { lastMessageAt: { $lt: cursorDate } },
            { lastMessageAt: cursorDate, _id: { $lt: boundary.id } },
          ],
        },
      });
    }

    aggregatePipeline.push(
      {
        $sort: {
          lastMessageAt: -1,
          _id: -1,
        },
      },
      { $limit: limit + 1 },
    );

    const sessions = await this.supportChatMessageModel.aggregate<{
      _id: string;
      firstMessage: string;
      lastMessageAt: Date;
    }>(aggregatePipeline);

    return buildCursorPage(sessions, limit, (session) =>
      encodeCursor('support-sessions', {
        id: session._id,
        sortValue: session.lastMessageAt.toISOString(),
      }),
    );
  }

  private async getOllamaHistory(
    userId: string,
    sessionId: string,
  ): Promise<OllamaChatMessage[]> {
    const previousMessages = await this.supportChatMessageModel
      .find({ sessionId, userId })
      .sort({ createdAt: 1 })
      .limit(20)
      .lean()
      .exec();

    return previousMessages.flatMap((message) => [
      {
        role: 'user' as const,
        content: message.userMessage,
      },
      {
        role: 'assistant' as const,
        content: message.assistantMessage,
      },
    ]);
  }

  private async resolveSessionId(userId: string, sessionId?: string) {
    const requestedSessionId = sessionId?.trim();

    if (!requestedSessionId) {
      return randomUUID();
    }

    const existingConversation = await this.supportChatConversationModel
      .findOne({ sessionId: requestedSessionId })
      .select('userId')
      .lean()
      .exec();

    if (existingConversation && existingConversation.userId !== userId) {
      return randomUUID();
    }

    return requestedSessionId;
  }

  private async askOllama(messages: OllamaChatMessage[], model: string) {
    const ollamaHost =
      this.configService.get<string>('OLLAMA_HOST') ?? 'http://localhost:11434';

    try {
      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            {
              role: 'system',
              content:
                'You are an AI support chat agent for a social media app. Use the prior messages in this session as memory. If the user gave their name or details earlier in this session, remember them. Answer clearly, ask one focused follow-up question when needed, and avoid inventing account-specific facts.',
            },
            ...messages,
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const data = (await response.json()) as OllamaChatResponse;
      const assistantMessage = data.message?.content?.trim();

      if (!assistantMessage) {
        throw new Error('Ollama returned an empty response');
      }

      return assistantMessage;
    } catch {
      throw new ServiceUnavailableException('AI support agent is unavailable');
    }
  }
}
