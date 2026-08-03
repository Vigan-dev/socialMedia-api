import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Conversation } from './conversation.schema';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
  _id!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Conversation.name,
    required: true,
    index: true,
  })
  conversation!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  sender!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  body!: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  deliveredTo!: Types.ObjectId[];

  @Prop({
    type: [
      {
        user: { type: Types.ObjectId, ref: User.name, required: true },
        readAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  readBy!: Array<{ user: Types.ObjectId; readAt: Date }>;

  createdAt!: Date;

  updatedAt!: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });
