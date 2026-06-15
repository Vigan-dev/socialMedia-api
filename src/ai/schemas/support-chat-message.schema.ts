import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupportChatMessageDocument = HydratedDocument<SupportChatMessage>;

@Schema({ timestamps: true })
export class SupportChatMessage {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, index: true })
  sessionId!: string;

  @Prop({ required: true, trim: true })
  userMessage!: string;

  @Prop({ required: true, trim: true })
  assistantMessage!: string;

  @Prop({ required: true })
  ollamaModel!: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export const SupportChatMessageSchema =
  SchemaFactory.createForClass(SupportChatMessage);
