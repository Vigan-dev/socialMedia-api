import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Post } from './post.schema';

export type SavedCollectionDocument = HydratedDocument<SavedCollection>;

@Schema({ timestamps: true })
export class SavedCollection {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  owner!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 60 })
  name!: string;

  @Prop({ required: true, trim: true, maxlength: 60 })
  normalizedName!: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: Post.name }], default: [] })
  posts!: Types.ObjectId[];
}

export const SavedCollectionSchema =
  SchemaFactory.createForClass(SavedCollection);

SavedCollectionSchema.index(
  { owner: 1, normalizedName: 1 },
  { name: 'saved_collection_owner_name_unique', unique: true },
);
SavedCollectionSchema.index({ owner: 1, createdAt: -1, _id: -1 });
