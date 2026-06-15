import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RelationshipService } from './relationship.service';
import { UserResponseMapper } from './user-response.mapper';

import { User, UserSchema } from './schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    NotificationsModule,
  ],
  controllers: [UsersController],
  providers: [RelationshipService, UserResponseMapper, UsersService],
  exports: [RelationshipService, UsersService],
})
export class UsersModule {}
