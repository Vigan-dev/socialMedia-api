import { IsIn } from 'class-validator';
import {
  ADMIN_REPORT_STATUSES,
  type AdminReportStatus,
} from '../admin.constants';

export class UpdateReportDto {
  @IsIn(ADMIN_REPORT_STATUSES)
  status!: AdminReportStatus;
}
