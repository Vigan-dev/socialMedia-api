export const ADMIN_REPORT_STATUSES = [
  'open',
  'reviewed',
  'dismissed',
  'actioned',
] as const;
export const ADMIN_USER_SEARCH_MAX_LENGTH = 100;

export type AdminReportStatus = (typeof ADMIN_REPORT_STATUSES)[number];

export function isAdminReportStatus(value: string): value is AdminReportStatus {
  return (ADMIN_REPORT_STATUSES as readonly string[]).includes(value);
}
