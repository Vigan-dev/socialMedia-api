import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AdminController } from '../../admin/admin.controller';
import { ModerationController } from '../../admin/moderation.controller';
import { roleGroups, type UserRole } from '../roles';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let reflector: {
    getAllAndOverride: jest.Mock;
  };
  let guard: RolesGuard;

  function createContext(role?: UserRole | string): ExecutionContext {
    return {
      getClass: jest.fn(),
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: role
            ? {
                email: `${role}@example.com`,
                id: `${role}-id`,
                role,
              }
            : undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows routes with no required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext('user'))).toBe(true);
  });

  it.each(['admin', 'moderator'])('allows %s access', (role) => {
    reflector.getAllAndOverride.mockReturnValue(roleGroups.moderation);

    expect(guard.canActivate(createContext(role))).toBe(true);
  });

  it('rejects normal users from admin/moderation routes', () => {
    reflector.getAllAndOverride.mockReturnValue(roleGroups.moderation);

    expect(guard.canActivate(createContext('user'))).toBe(false);
  });

  it('rejects moderators from admin-only routes', () => {
    reflector.getAllAndOverride.mockReturnValue(roleGroups.adminOnly);

    expect(guard.canActivate(createContext('moderator'))).toBe(false);
  });

  it('rejects unauthenticated requests from protected role routes', () => {
    reflector.getAllAndOverride.mockReturnValue(roleGroups.moderation);

    expect(guard.canActivate(createContext())).toBe(false);
  });

  it('marks admin routes as admin only', () => {
    expect(Reflect.getMetadata('roles', AdminController)).toEqual(
      roleGroups.adminOnly,
    );
  });

  it('marks moderation routes as admin or moderator only', () => {
    expect(Reflect.getMetadata('roles', ModerationController)).toEqual(
      roleGroups.moderation,
    );
  });
});
