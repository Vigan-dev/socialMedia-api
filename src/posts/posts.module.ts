import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PostsController } from './posts.controller';
import { PostFeedMapper } from './post-feed.mapper';
import { PostReportsService } from './post-reports.service';
import { PostsService } from './posts.service';
import { Post, PostSchema } from './schemas/post.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { Report, ReportSchema } from './schemas/report.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import {
  SavedCollection,
  SavedCollectionSchema,
} from './schemas/saved-collection.schema';
import { SavedPostsController } from './saved-posts.controller';
import { SavedPostsService } from './saved-posts.service';
import {
  RecommendationFeedback,
  RecommendationFeedbackSchema,
} from './schemas/recommendation-feedback.schema';
import { RecommendationFeedbackService } from './recommendation-feedback.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Report.name, schema: ReportSchema },
      { name: User.name, schema: UserSchema },
      { name: SavedCollection.name, schema: SavedCollectionSchema },
      {
        name: RecommendationFeedback.name,
        schema: RecommendationFeedbackSchema,
      },
    ]),
    NotificationsModule,
    UsersModule,
  ],
  controllers: [PostsController, SavedPostsController],
  providers: [
    PostFeedMapper,
    PostReportsService,
    PostsService,
    SavedPostsService,
    RecommendationFeedbackService,
  ],
  exports: [PostsService],
})
export class PostsModule {}
