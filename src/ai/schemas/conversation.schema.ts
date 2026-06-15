import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupportChatConversationDocument =
  HydratedDocument<SupportChatConversation>;

@Schema({ timestamps: true })
export class SupportChatConversation {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, unique: true, index: true })
  sessionId!: string;

  @Prop({ required: true, trim: true })
  firstMessage!: string;

  @Prop({ required: true, default: Date.now })
  lastMessageAt!: Date;

  @Prop({ required: true, default: 0 })
  messageCount!: number;

  @Prop({ required: true })
  ollamaModel!: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export const SupportChatConversationSchema = SchemaFactory.createForClass(
  SupportChatConversation,
);
