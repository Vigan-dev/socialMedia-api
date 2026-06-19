import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request } from 'express';

type UploadPurpose = 'avatar' | 'post-media';

const allowedMimeTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const extensionsByMimeType: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const maxBytesByPurpose: Record<UploadPurpose, number> = {
  avatar: 1_000_000,
  'post-media': 5_000_000,
};

@Injectable()
export class UploadsService {
  async saveImage(input: {
    dataUrl: string;
    purpose: UploadPurpose;
    request: Request;
  }) {
    const { buffer, mimeType } = this.parseImageDataUrl(input.dataUrl);
    const maxBytes = maxBytesByPurpose[input.purpose];

    if (buffer.byteLength > maxBytes) {
      throw new BadRequestException(
        input.purpose === 'avatar'
          ? 'Avatar image must be 1 MB or smaller after processing'
          : 'Post image must be 5 MB or smaller',
      );
    }

    this.assertImageSignature(buffer, mimeType);

    const directory = input.purpose === 'avatar' ? 'avatars' : 'post-media';
    const extension = extensionsByMimeType[mimeType];
    const fileName = `${randomUUID()}.${extension}`;
    const relativePath = `/uploads/${directory}/${fileName}`;
    const targetDirectory = join(process.cwd(), 'uploads', directory);
    const targetPath = join(targetDirectory, fileName);

    try {
      await mkdir(targetDirectory, { recursive: true });
      await writeFile(targetPath, buffer, { flag: 'wx' });
    } catch {
      throw new InternalServerErrorException('Image upload failed');
    }

    return {
      url: `${this.getRequestOrigin(input.request)}${relativePath}`,
    };
  }

  private parseImageDataUrl(dataUrl: string) {
    const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) {
      throw new BadRequestException('Invalid image data URL');
    }

    const mimeType = match[1].toLowerCase();
    if (!allowedMimeTypes.has(mimeType)) {
      throw new BadRequestException('Unsupported image type');
    }

    try {
      return {
        buffer: Buffer.from(match[2], 'base64'),
        mimeType,
      };
    } catch {
      throw new BadRequestException('Invalid image data');
    }
  }

  private assertImageSignature(buffer: Buffer, mimeType: string) {
    const isPng = buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isGif =
      buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
    const isWebp =
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';

    const matchesMimeType =
      (mimeType === 'image/png' && isPng) ||
      (mimeType === 'image/jpeg' && isJpeg) ||
      (mimeType === 'image/gif' && isGif) ||
      (mimeType === 'image/webp' && isWebp);

    if (!matchesMimeType) {
      throw new BadRequestException('Image content does not match its type');
    }
  }

  private getRequestOrigin(request: Request) {
    const host =
      this.getFirstHeaderPart(request, 'x-forwarded-host') ??
      this.getFirstHeaderPart(request, 'host') ??
      request.hostname;
    const protocol =
      this.getFirstHeaderPart(request, 'x-forwarded-proto') ?? request.protocol;

    return `${protocol}://${host}`;
  }

  private getFirstHeaderPart(request: Request, name: string) {
    const value = request.headers[name];
    const header = Array.isArray(value) ? value[0] : value;

    return header?.split(',')[0]?.trim();
  }
}
