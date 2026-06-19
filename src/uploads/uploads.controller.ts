import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { UploadImageDto } from './dto/upload-image.dto';
import { UploadsService } from './uploads.service';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('images')
  @RateLimit({ keyPrefix: 'uploads:images', limit: 20, ttlMs: 60_000 })
  uploadImage(@Body() body: UploadImageDto, @Req() request: Request) {
    return this.uploadsService.saveImage({
      dataUrl: body.dataUrl,
      purpose: body.purpose,
      request,
    });
  }
}
