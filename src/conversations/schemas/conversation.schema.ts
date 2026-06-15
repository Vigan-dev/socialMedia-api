import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], required: true })
  participants!: Types.ObjectId[];

  @Prop({ default: '' })
  lastMessage!: string;

  @Prop()
  lastMessageAt?: Date;

  @Prop({ type: Map, of: Number, default: {} })
  unreadCounts!: Map<string, number>;

  @Prop({
    type: [
      {
        expiresAt: { type: Date, required: true },
        user: { type: Types.ObjectId, ref: User.name, required: true },
      },
    ],
    default: [],
  })
  typing!: Array<{ user: Types.ObjectId; expiresAt: Date }>;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ participants: 1, updatedAt: -1 });
