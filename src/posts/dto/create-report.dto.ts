import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ReportReason, ReportTargetType } from '../schemas/report.schema';

const reportTargetTypes: ReportTargetType[] = ['post', 'comment', 'user'];
const reportReasons: ReportReason[] = [
  'spam',
  'harassment',
  'hate',
  'self_harm',
  'sexual_content',
  'violence',
  'other',
];

export class CreateReportDto {
  @IsIn(reportTargetTypes)
  targetType!: ReportTargetType;

  @IsString()
  @MaxLength(80)
  targetId!: string;

  @IsIn(reportReasons)
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}
