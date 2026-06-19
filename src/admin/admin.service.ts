import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from '../posts/schemas/post.schema';
import type { PostDocument } from '../posts/schemas/post.schema';
import { Report } from '../posts/schemas/report.schema';
import type { ReportDocument } from '../posts/schemas/report.schema';
import { User } from '../users/schemas/user.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import {
  mapLeanReportToAdminReport,
  type LeanAdminReport,
} from './admin-report.mapper';

const REPORT_STATUSES = ['open', 'reviewed', 'dismissed', 'actioned'];

type AdminUserRecord = Pick<
  User,
  'email' | 'isSuspended' | 'role' | 'suspensionReason' | 'username'
> & {
  _id: Types.ObjectId;
  createdAt?: Date;
};

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  getProfile() {
    return { message: 'Protected admin profile' };
  }

  async getMetrics() {
    const [totalUsers, suspendedUsers, totalPosts, openReports, totalReports] =
      await Promise.all([
        this.userModel.countDocuments(),
        this.userModel.countDocuments({ isSuspended: true }),
        this.postModel.countDocuments(),
        this.reportModel.countDocuments({ status: 'open' }),
        this.reportModel.countDocuments(),
      ]);

    const reportBreakdown = await this.reportModel.aggregate<{
      _id: string;
      count: number;
    }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

    return {
      openReports,
      reportBreakdown,
      suspendedUsers,
      totalPosts,
      totalReports,
      totalUsers,
    };
  }

  async getUsers(query = '') {
    const filter = query.trim()
      ? {
          $or: [
            { username: { $regex: query.trim(), $options: 'i' } },
            { email: { $regex: query.trim(), $options: 'i' } },
          ],
        }
      : {};

    const users = await this.userModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .select('username email role isSuspended suspensionReason createdAt')
      .lean<AdminUserRecord[]>()
      .exec();

    return users.map((user) => ({
      createdAt: user.createdAt,
      email: user.email,
      id: user._id.toString(),
      isSuspended: Boolean(user.isSuspended),
      role: user.role,
      suspensionReason: user.suspensionReason ?? '',
      username: user.username,
    }));
  }

  async updateUserSuspension(
    id: string,
    body: { isSuspended?: boolean; reason?: string },
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }

    const user = await this.userModel.findByIdAndUpdate(
      id,
      {
        isSuspended: Boolean(body.isSuspended),
        suspensionReason: body.isSuspended ? (body.reason?.trim() ?? '') : '',
      },
      { returnDocument: 'after', runValidators: true },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      email: user.email,
      id: user._id.toString(),
      isSuspended: Boolean(user.isSuspended),
      role: user.role,
      suspensionReason: user.suspensionReason ?? '',
      username: user.username,
    };
  }

  async getReports(status = 'open') {
    const filter = REPORT_STATUSES.includes(status) ? { status } : {};
    const reports = await this.reportModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('reporter', 'username email')
      .lean<LeanAdminReport[]>()
      .exec();

    return reports.map(mapLeanReportToAdminReport);
  }

  async updateReport(id: string, status = '') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid report id');
    }

    if (!REPORT_STATUSES.includes(status)) {
      throw new BadRequestException('Invalid report status');
    }

    const report = await this.reportModel.findByIdAndUpdate(
      id,
      { status },
      { returnDocument: 'after', runValidators: true },
    );

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return { id: report._id.toString(), status: report.status };
  }

  async deletePost(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid post id');
    }

    const result = await this.postModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Post not found');
    }

    await this.reportModel.updateMany(
      { targetId: id, targetType: 'post' },
      { status: 'actioned' },
    );

    return { deletedPostId: id, success: true };
  }

  async deleteComment(id: string) {
    const post = await this.postModel.findOne({ 'comments._id': id });
    if (!post) {
      throw new NotFoundException('Comment not found');
    }

    post.comments = (post.comments ?? []).filter(
      (comment) => comment._id.toString() !== id,
    );
    post.commentsCount = this.countComments(post.comments ?? []);
    await post.save();

    await this.reportModel.updateMany(
      { targetId: id, targetType: 'comment' },
      { status: 'actioned' },
    );

    return { deletedCommentId: id, success: true };
  }

  private countComments(comments: NonNullable<PostDocument['comments']>) {
    return comments.reduce(
      (count, comment) => count + 1 + (comment.replies?.length ?? 0),
      0,
    );
  }
}
