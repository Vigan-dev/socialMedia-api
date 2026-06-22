import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ConversationDocument = HydratedDocument<Conversation>;

export function createConversationKey(
  participantIds: Array<string | Types.ObjectId>,
) {
  return participantIds
    .map((participantId) => participantId.toString())
    .sort()
    .join(':');
}

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: true })
  conversationKey!: string;

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

ConversationSchema.pre('validate', function setConversationKey(next) {
  if (!this.conversationKey && this.participants?.length) {
    this.conversationKey = createConversationKey(this.participants);
  }

  next();
});

ConversationSchema.index(
  { conversationKey: 1 },
  {
    partialFilterExpression: { conversationKey: { $type: 'string' } },
    unique: true,
  },
);
ConversationSchema.index({ participants: 1, updatedAt: -1 });
