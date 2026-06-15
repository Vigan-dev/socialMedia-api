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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Report.name, schema: ReportSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    UsersModule,
  ],
  controllers: [PostsController],
  providers: [PostFeedMapper, PostReportsService, PostsService],
  exports: [PostsService],
})
export class PostsModule {}
