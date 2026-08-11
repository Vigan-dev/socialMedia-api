import { validate } from 'class-validator';
import { AdminIdParamDto } from './admin-id-param.dto';
import { AdminReportsQueryDto, AdminUsersQueryDto } from './admin-query.dto';
import { UpdateReportDto } from './update-report.dto';
import { UpdateUserSuspensionDto } from './update-user-suspension.dto';

describe('Admin DTO validation', () => {
  it('requires a boolean suspension state and bounds the reason', async () => {
    const validDto = Object.assign(new UpdateUserSuspensionDto(), {
      isSuspended: true,
      reason: 'Repeated harassment',
    });
    const missingStateDto = Object.assign(new UpdateUserSuspensionDto(), {
      reason: 'Missing suspension state',
    });
    const stringStateDto = Object.assign(new UpdateUserSuspensionDto(), {
      isSuspended: 'false',
    });
    const longReasonDto = Object.assign(new UpdateUserSuspensionDto(), {
      isSuspended: true,
      reason: 'a'.repeat(501),
    });

    await expect(validate(validDto)).resolves.toHaveLength(0);
    await expect(validate(missingStateDto)).resolves.not.toHaveLength(0);
    await expect(validate(stringStateDto)).resolves.not.toHaveLength(0);
    await expect(validate(longReasonDto)).resolves.not.toHaveLength(0);
  });

  it('accepts only supported report status updates', async () => {
    const validDto = Object.assign(new UpdateReportDto(), {
      status: 'reviewed',
    });
    const invalidDto = Object.assign(new UpdateReportDto(), {
      status: 'pending',
    });
    const missingDto = new UpdateReportDto();

    await expect(validate(validDto)).resolves.toHaveLength(0);
    await expect(validate(invalidDto)).resolves.not.toHaveLength(0);
    await expect(validate(missingDto)).resolves.not.toHaveLength(0);
  });

  it('validates report filters and bounds user search queries', async () => {
    const validReportsQuery = Object.assign(new AdminReportsQueryDto(), {
      status: 'open',
    });
    const invalidReportsQuery = Object.assign(new AdminReportsQueryDto(), {
      status: 'unknown',
    });
    const longUsersQuery = Object.assign(new AdminUsersQueryDto(), {
      q: 'a'.repeat(101),
    });

    await expect(validate(validReportsQuery)).resolves.toHaveLength(0);
    await expect(validate(invalidReportsQuery)).resolves.not.toHaveLength(0);
    await expect(validate(longUsersQuery)).resolves.not.toHaveLength(0);
  });

  it('requires MongoDB object IDs for admin resource routes', async () => {
    const validDto = Object.assign(new AdminIdParamDto(), {
      id: '507f1f77bcf86cd799439011',
    });
    const invalidDto = Object.assign(new AdminIdParamDto(), {
      id: 'not-an-object-id',
    });

    await expect(validate(validDto)).resolves.toHaveLength(0);
    await expect(validate(invalidDto)).resolves.not.toHaveLength(0);
  });
});
