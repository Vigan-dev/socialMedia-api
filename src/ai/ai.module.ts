import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import {
  SupportChatMessage,
  SupportChatMessageSchema,
} from './schemas/support-chat-message.schema';
import {
  SupportChatConversation,
  SupportChatConversationSchema,
} from './schemas/conversation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: SupportChatMessage.name,
        schema: SupportChatMessageSchema,
      },
      {
        name: SupportChatConversation.name,
        schema: SupportChatConversationSchema,
      },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
