import { Types } from 'mongoose';

type PopulatedReporter = {
  _id: Types.ObjectId;
  email: string;
  username: string;
};

export type LeanAdminReport = {
  _id: Types.ObjectId;
  createdAt?: Date;
  details: string;
  reason: string;
  reporter?: PopulatedReporter | Types.ObjectId | null;
  status: string;
  targetId: string;
  targetType: string;
};

function isPopulatedReporter(
  reporter: LeanAdminReport['reporter'],
): reporter is PopulatedReporter {
  return (
    Boolean(reporter) &&
    !(reporter instanceof Types.ObjectId) &&
    typeof reporter === 'object' &&
    reporter !== null &&
    '_id' in reporter &&
    'email' in reporter &&
    'username' in reporter
  );
}

export function mapLeanReportToAdminReport(report: LeanAdminReport) {
  return {
    createdAt: report.createdAt,
    details: report.details,
    id: report._id.toString(),
    reason: report.reason,
    reporter: isPopulatedReporter(report.reporter)
      ? {
          email: report.reporter.email,
          id: report.reporter._id.toString(),
          username: report.reporter.username,
        }
      : null,
    status: report.status,
    targetId: report.targetId,
    targetType: report.targetType,
  };
}
