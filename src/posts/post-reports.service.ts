import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from './schemas/post.schema';
import type { PostDocument } from './schemas/post.schema';
import { Report } from './schemas/report.schema';
import type { ReportDocument } from './schemas/report.schema';
import { User } from '../users/schemas/user.schema';
import type { UserDocument } from '../users/schemas/user.schema';

export type CreateReportInput = {
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  reason: string;
  details?: string;
};

@Injectable()
export class PostReportsService {
  constructor(
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async createReport(createReportDto: CreateReportInput, reporterId: string) {
    await this.assertReportTargetExists(
      createReportDto.targetType,
      createReportDto.targetId,
    );

    const report = await this.reportModel.findOneAndUpdate(
      {
        reporter: new Types.ObjectId(reporterId),
        targetId: createReportDto.targetId,
        targetType: createReportDto.targetType,
      },
      {
        details: createReportDto.details?.trim() ?? '',
        reason: createReportDto.reason,
        reporter: new Types.ObjectId(reporterId),
        status: 'open',
        targetId: createReportDto.targetId,
        targetType: createReportDto.targetType,
      },
      { returnDocument: 'after', runValidators: true, upsert: true },
    );

    await this.hideReportedTarget(createReportDto, reporterId);

    if (!report) {
      throw new BadRequestException('Report could not be created');
    }

    return {
      id: report._id.toString(),
      hidden: createReportDto.targetType !== 'user',
      ok: true,
    };
  }

  private async assertReportTargetExists(targetType: string, targetId: string) {
    if (targetType === 'user') {
      if (!Types.ObjectId.isValid(targetId)) {
        throw new BadRequestException('Invalid user id');
      }

      const exists = await this.userModel.exists({ _id: targetId });
      if (!exists) throw new NotFoundException('User not found');
      return;
    }

    if (targetType === 'post') {
      if (!Types.ObjectId.isValid(targetId)) {
        throw new BadRequestException('Invalid post id');
      }

      const exists = await this.postModel.exists({ _id: targetId });
      if (!exists) throw new NotFoundException('Post not found');
      return;
    }

    const post = await this.postModel.exists({ 'comments._id': targetId });
    if (!post) {
      throw new NotFoundException('Comment not found');
    }
  }

  private async hideReportedTarget(
    target: { targetType: string; targetId: string },
    reporterId: string,
  ) {
    const userObjectId = new Types.ObjectId(reporterId);

    if (target.targetType === 'post') {
      await this.postModel.updateOne(
        { _id: target.targetId },
        { $addToSet: { hiddenBy: userObjectId } },
      );
      return;
    }

    if (target.targetType === 'comment') {
      await this.postModel.updateOne(
        { 'comments._id': target.targetId },
        { $addToSet: { 'comments.$.hiddenBy': userObjectId } },
      );
    }
  }
}
