import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ADMIN_REPORT_STATUSES,
  ADMIN_USER_SEARCH_MAX_LENGTH,
  type AdminReportStatus,
} from '../admin.constants';

export class AdminUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_USER_SEARCH_MAX_LENGTH)
  q?: string;
}

export class AdminReportsQueryDto {
  @IsOptional()
  @IsIn(ADMIN_REPORT_STATUSES)
  status?: AdminReportStatus;
}
