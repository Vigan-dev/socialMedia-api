import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { ModerationController } from './moderation.controller';
import { AdminService } from './admin.service';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { Post, PostSchema } from '../posts/schemas/post.schema';
import { Report, ReportSchema } from '../posts/schemas/report.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Report.name, schema: ReportSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminController, ModerationController],
  providers: [AdminBootstrapService, AdminService],
})
export class AdminModule {}
