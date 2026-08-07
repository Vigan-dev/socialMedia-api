import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateSavedCollectionDto } from './dto/create-saved-collection.dto';
import { SavedPostsService } from './saved-posts.service';

type RequestWithUser = Request & {
  user?: { id: string };
};

@Controller('saved-posts')
@UseGuards(JwtAuthGuard)
export class SavedPostsController {
  constructor(private readonly savedPostsService: SavedPostsService) {}

  @Get()
  findSavedPosts(
    @Req() request: RequestWithUser,
    @Query('collectionId') collectionId?: string,
  ) {
    return this.savedPostsService.findSavedPosts(
      request.user!.id,
      collectionId,
    );
  }

  @Put(':postId')
  savePost(@Param('postId') postId: string, @Req() request: RequestWithUser) {
    return this.savedPostsService.setSaved(postId, request.user!.id, true);
  }

  @Delete(':postId')
  unsavePost(@Param('postId') postId: string, @Req() request: RequestWithUser) {
    return this.savedPostsService.setSaved(postId, request.user!.id, false);
  }

  @Get('collections')
  findCollections(@Req() request: RequestWithUser) {
    return this.savedPostsService.findCollections(request.user!.id);
  }

  @Post('collections')
  createCollection(
    @Body() body: CreateSavedCollectionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.savedPostsService.createCollection(request.user!.id, body.name);
  }

  @Patch('collections/:collectionId')
  renameCollection(
    @Param('collectionId') collectionId: string,
    @Body() body: CreateSavedCollectionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.savedPostsService.renameCollection(
      request.user!.id,
      collectionId,
      body.name,
    );
  }

  @Delete('collections/:collectionId')
  deleteCollection(
    @Param('collectionId') collectionId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.savedPostsService.deleteCollection(
      request.user!.id,
      collectionId,
    );
  }

  @Put('collections/:collectionId/posts/:postId')
  addPostToCollection(
    @Param('collectionId') collectionId: string,
    @Param('postId') postId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.savedPostsService.addPostToCollection(
      request.user!.id,
      collectionId,
      postId,
    );
  }

  @Delete('collections/:collectionId/posts/:postId')
  removePostFromCollection(
    @Param('collectionId') collectionId: string,
    @Param('postId') postId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.savedPostsService.removePostFromCollection(
      request.user!.id,
      collectionId,
      postId,
    );
  }
}
